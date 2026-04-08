import ModbusRTU from "modbus-serial";

export interface ModbusOptions {
  host: string;
  port?: number;
  unitId?: number;
  timeout?: number;
}

export interface RTUOptions {
  port: string;       // e.g. /dev/ttyUSB0, COM3
  baudRate: number;
  dataBits?: number;
  parity?: "none" | "even" | "odd";
  stopBits?: number;
  unitId?: number;
  timeout?: number;
}

export interface RegisterResult {
  address: number;
  value: number;
}

export class ModbusClient {
  private client: ModbusRTU;
  private opts: Required<ModbusOptions>;

  constructor(opts: ModbusOptions) {
    this.client = new ModbusRTU();
    this.opts = {
      host: opts.host,
      port: opts.port ?? 502,
      unitId: opts.unitId ?? 1,
      timeout: opts.timeout ?? 3000,
    };
  }

  async connect(): Promise<void> {
    this.client.setTimeout(this.opts.timeout);
    await this.client.connectTCP(this.opts.host, { port: this.opts.port });
    this.client.setID(this.opts.unitId);
  }

  async readHoldingRegisters(address: number, count: number): Promise<RegisterResult[]> {
    const res = await this.client.readHoldingRegisters(address, count);
    return res.data.map((value, i) => ({
      address: 40001 + address + i,
      value,
    }));
  }

  async readCoils(address: number, count: number): Promise<{ address: number; value: boolean }[]> {
    const res = await this.client.readCoils(address, count);
    return res.data.map((value, i) => ({ address: address + i, value }));
  }

  async writeRegister(address: number, value: number): Promise<void> {
    await this.client.writeRegister(address, value);
  }

  async ping(): Promise<boolean> {
    try {
      await this.readHoldingRegisters(0, 1);
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    this.client.close(() => {});
  }
}

export class ModbusRTUClient {
  private client: ModbusRTU;
  private opts: Required<RTUOptions>;

  constructor(opts: RTUOptions) {
    this.client = new ModbusRTU();
    this.opts = {
      port:     opts.port,
      baudRate: opts.baudRate,
      dataBits: opts.dataBits ?? 8,
      parity:   opts.parity   ?? "none",
      stopBits: opts.stopBits ?? 1,
      unitId:   opts.unitId   ?? 1,
      timeout:  opts.timeout  ?? 3000,
    };
  }

  async connect(): Promise<void> {
    this.client.setTimeout(this.opts.timeout);
    await this.client.connectRTUBuffered(this.opts.port, {
      baudRate: this.opts.baudRate,
      dataBits: this.opts.dataBits,
      parity:   this.opts.parity,
      stopBits: this.opts.stopBits,
    });
    this.client.setID(this.opts.unitId);
  }

  async readHoldingRegisters(address: number, count: number): Promise<RegisterResult[]> {
    const res = await this.client.readHoldingRegisters(address, count);
    return res.data.map((value, i) => ({ address: 40001 + address + i, value }));
  }

  async readCoils(address: number, count: number): Promise<{ address: number; value: boolean }[]> {
    const res = await this.client.readCoils(address, count);
    return res.data.map((value, i) => ({ address: address + i, value }));
  }

  async writeRegister(address: number, value: number): Promise<void> {
    await this.client.writeRegister(address, value);
  }

  setUnitId(id: number): void {
    this.opts.unitId = id;
    this.client.setID(id);
  }

  getUnitId(): number {
    return this.opts.unitId;
  }

  disconnect(): void {
    this.client.close(() => {});
  }
}
