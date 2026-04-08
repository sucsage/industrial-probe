import { spawn, ChildProcess } from 'child_process';
import { execFile }            from 'child_process';
import { DeviceRegistry }      from './DeviceRegistry.js';

function crc16(buf: Buffer): number {
  let crc = 0xFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
      crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
  }
  return crc;
}

export class ModbusRtuServer {
  private socat:      ChildProcess | null = null;
  private port:       any = null;
  public  serverPath = '';
  public  clientPath = '';

  constructor(private registry: DeviceRegistry) {}

  /** Returns false if socat is not installed. */
  static async isSocatAvailable(): Promise<boolean> {
    return new Promise(res => {
      execFile('which', ['socat'], err => res(!err));
    });
  }

  async start(baudRate = 9600): Promise<void> {
    // 1. Spawn socat to create a virtual serial pair
    this.socat = spawn('socat', ['-d', '-d', 'pty,raw,echo=0', 'pty,raw,echo=0']);

    const paths = await new Promise<[string, string]>((resolve, reject) => {
      const ptys: string[] = [];
      const timer = setTimeout(() => reject(new Error('socat timeout')), 4000);

      const parse = (data: Buffer) => {
        const text  = data.toString();
        const found = [...text.matchAll(/opening character device "([^"]+)"/g)];
        for (const m of found) ptys.push(m[1]);
        if (ptys.length >= 2) { clearTimeout(timer); resolve([ptys[0], ptys[1]]); }
      };

      this.socat!.stderr?.on('data', parse);
      this.socat!.on('error', (e) => { clearTimeout(timer); reject(e); });
    });

    [this.serverPath, this.clientPath] = paths;

    // 2. Open server-side PTY via serialport (dynamic import — graceful if unavailable)
    // Using Function() to bypass TypeScript module resolution for optional native dep
    const spModule: any = await (new Function('m', 'return import(m)'))('serialport').catch(() => {
      throw new Error('serialport not available — run: pnpm approve-builds');
    });
    const SerialPort = spModule.SerialPort ?? spModule.default?.SerialPort;
    this.port = new SerialPort({ path: this.serverPath, baudRate, autoOpen: false });
    await new Promise<void>((res, rej) => this.port.open((e: any) => e ? rej(e) : res()));

    this.listen();
  }

  stop(): void {
    try { this.port?.close(); } catch { /* ignore */ }
    this.socat?.kill();
  }

  // ── RTU frame handling ─────────────────────────────────────────────────────

  private listen(): void {
    let buf   = Buffer.alloc(0);
    let timer: NodeJS.Timeout | null = null;

    this.port.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (timer) clearTimeout(timer);
      // End-of-frame: ~5ms silence (safe for ≥ 9600 baud)
      timer = setTimeout(() => {
        if (buf.length >= 4) {
          const resp = this.processFrame(buf);
          if (resp) this.port.write(resp);
        }
        buf   = Buffer.alloc(0);
        timer = null;
      }, 5);
    });
  }

  private processFrame(req: Buffer): Buffer | null {
    if (req.length < 4) return null;

    const recvCrc = req.readUInt16LE(req.length - 2);
    if (crc16(req.slice(0, -2)) !== recvCrc) return null;

    const unitId = req[0];
    const fc     = req[1];

    if (!this.registry.get(unitId)) return null; // not our device — stay silent

    let pduResp: Buffer;
    try {
      switch (fc) {
        case 0x01: case 0x02: {
          const start = req.readUInt16BE(2);
          const count = req.readUInt16BE(4);
          const bytes = Math.ceil(count / 8);
          pduResp     = Buffer.alloc(2 + bytes);
          pduResp[0]  = fc; pduResp[1] = bytes;
          for (let i = 0; i < count; i++)
            if (this.registry.getCoil(unitId, start + i))
              pduResp[2 + Math.floor(i / 8)] |= 1 << (i % 8);
          break;
        }
        case 0x03: case 0x04: {
          const start = req.readUInt16BE(2);
          const count = req.readUInt16BE(4);
          pduResp     = Buffer.alloc(2 + count * 2);
          pduResp[0]  = fc; pduResp[1] = count * 2;
          for (let i = 0; i < count; i++)
            pduResp.writeUInt16BE(this.registry.getHolding(unitId, start + i), 2 + i * 2);
          break;
        }
        case 0x06: {
          const addr  = req.readUInt16BE(2);
          const value = req.readUInt16BE(4);
          this.registry.setHolding(unitId, addr, value);
          pduResp = Buffer.allocUnsafe(5);
          pduResp[0] = fc;
          pduResp.writeUInt16BE(addr,  1);
          pduResp.writeUInt16BE(value, 3);
          break;
        }
        case 0x10: {
          const start = req.readUInt16BE(2);
          const count = req.readUInt16BE(4);
          for (let i = 0; i < count; i++)
            this.registry.setHolding(unitId, start + i, req.readUInt16BE(7 + i * 2));
          pduResp = Buffer.allocUnsafe(5);
          pduResp[0] = fc;
          pduResp.writeUInt16BE(start, 1);
          pduResp.writeUInt16BE(count, 3);
          break;
        }
        default:
          pduResp = Buffer.from([fc | 0x80, 0x01]);
      }
    } catch {
      pduResp = Buffer.from([fc | 0x80, 0x04]);
    }

    const resp = Buffer.alloc(1 + pduResp.length + 2);
    resp[0] = unitId;
    pduResp.copy(resp, 1);
    const c = crc16(resp.slice(0, -2));
    resp.writeUInt16LE(c, resp.length - 2);
    return resp;
  }
}
