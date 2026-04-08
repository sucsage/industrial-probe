import net from 'net';
import { DeviceRegistry } from './DeviceRegistry.js';

export interface RequestLog {
  ts:     string;
  unitId: number;
  fc:     number;
  addr:   number;
  count:  number;
  write?: number;
}

/** Pure Node.js Modbus TCP server — no extra dependencies. */
export class ModbusTcpServer {
  private server:      net.Server;
  private connections = new Set<net.Socket>();
  private _requests   = 0;
  private _log:       RequestLog[] = [];

  constructor(private registry: DeviceRegistry) {
    this.server = net.createServer(s => this.handleSocket(s));
  }

  get connectionCount(): number { return this.connections.size; }
  get requestCount():    number { return this._requests; }
  get recentLog():       RequestLog[] { return this._log.slice(-8); }

  listen(port: number): Promise<void> {
    return new Promise((res, rej) => {
      this.server.once('error', rej);
      this.server.listen(port, '0.0.0.0', () => res());
    });
  }

  close(): Promise<void> {
    return new Promise(res => {
      for (const s of this.connections) s.destroy();
      this.server.close(() => res());
    });
  }

  // ── Socket handling ────────────────────────────────────────────────────────

  private handleSocket(socket: net.Socket): void {
    this.connections.add(socket);
    socket.on('close', () => this.connections.delete(socket));

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 6) {
        const pduLen = buf.readUInt16BE(4); // length field includes unitId byte
        if (buf.length < 6 + pduLen) break;
        const resp = this.process(buf.slice(0, 6 + pduLen));
        buf = buf.slice(6 + pduLen);
        if (resp) socket.write(resp);
      }
    });
  }

  // ── Request processing ─────────────────────────────────────────────────────

  private process(req: Buffer): Buffer | null {
    const txId   = req.readUInt16BE(0);
    const unitId = req[6];
    const fc     = req[7];
    this._requests++;

    let pdu: Buffer;
    try {
      pdu = this.dispatchFc(unitId, fc, req);
    } catch {
      pdu = Buffer.from([fc | 0x80, 0x04]);
    }

    // Build MBAP response: txId(2) + protId(2) + length(2) + unitId(1) + pdu
    const resp = Buffer.alloc(7 + pdu.length);
    resp.writeUInt16BE(txId, 0);
    resp.writeUInt16BE(0,    2);
    resp.writeUInt16BE(1 + pdu.length, 4);
    resp[6] = unitId;
    pdu.copy(resp, 7);
    return resp;
  }

  private dispatchFc(unitId: number, fc: number, req: Buffer): Buffer {
    switch (fc) {

      // ── Read Coils / Discrete Inputs ───────────────────────────────────────
      case 0x01: case 0x02: {
        const start = req.readUInt16BE(8);
        const count = req.readUInt16BE(10);
        this.log({ unitId, fc, addr: start, count });
        const bytes = Math.ceil(count / 8);
        const pdu   = Buffer.alloc(2 + bytes);
        pdu[0] = fc; pdu[1] = bytes;
        for (let i = 0; i < count; i++) {
          if (this.registry.getCoil(unitId, start + i))
            pdu[2 + Math.floor(i / 8)] |= 1 << (i % 8);
        }
        return pdu;
      }

      // ── Read Holding / Input Registers ─────────────────────────────────────
      case 0x03: case 0x04: {
        const start = req.readUInt16BE(8);
        const count = req.readUInt16BE(10);
        this.log({ unitId, fc, addr: start, count });
        const pdu = Buffer.alloc(2 + count * 2);
        pdu[0] = fc; pdu[1] = count * 2;
        for (let i = 0; i < count; i++)
          pdu.writeUInt16BE(this.registry.getHolding(unitId, start + i), 2 + i * 2);
        return pdu;
      }

      // ── Write Single Coil ──────────────────────────────────────────────────
      case 0x05: {
        const addr  = req.readUInt16BE(8);
        const value = req.readUInt16BE(10) === 0xFF00;
        this.registry.setCoil(unitId, addr, value);
        this.log({ unitId, fc, addr, count: 1, write: value ? 1 : 0 });
        return Buffer.from(req.subarray(7, 11));
      }

      // ── Write Single Register ──────────────────────────────────────────────
      case 0x06: {
        const addr  = req.readUInt16BE(8);
        const value = req.readUInt16BE(10);
        this.registry.setHolding(unitId, addr, value);
        this.log({ unitId, fc, addr, count: 1, write: value });
        return Buffer.from(req.subarray(7, 11));
      }

      // ── Write Multiple Registers ───────────────────────────────────────────
      case 0x10: {
        const start = req.readUInt16BE(8);
        const count = req.readUInt16BE(10);
        for (let i = 0; i < count; i++)
          this.registry.setHolding(unitId, start + i, req.readUInt16BE(13 + i * 2));
        this.log({ unitId, fc, addr: start, count });
        const pdu = Buffer.alloc(5);
        pdu[0] = fc;
        pdu.writeUInt16BE(start, 1);
        pdu.writeUInt16BE(count, 3);
        return pdu;
      }

      default:
        return Buffer.from([fc | 0x80, 0x01]); // illegal function
    }
  }

  private log(entry: Omit<RequestLog, 'ts'>): void {
    this._log.push({ ts: new Date().toLocaleTimeString(), ...entry });
    if (this._log.length > 50) this._log.shift();
  }
}
