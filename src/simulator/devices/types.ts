export interface RegMeta {
  label:    string;
  unit?:    string;
  writable?: boolean;
}

export interface CoilMeta {
  label:    string;
  writable?: boolean;
}

export interface SimDevice {
  readonly name:       string;
  readonly deviceType: string;
  readonly unitId:     number;
  readonly registers:  Uint16Array;
  readonly coils:      Uint8Array;
  readonly regMeta:    Map<number, RegMeta>;
  readonly coilMeta:   Map<number, CoilMeta>;

  init(): void;
  tick(dt: number): void;
  onWrite(address: number, value: number): void;
  onCoilWrite(address: number, value: boolean): void;
}

export abstract class BaseDevice implements SimDevice {
  abstract readonly name:       string;
  abstract readonly deviceType: string;
  abstract readonly regMeta:    Map<number, RegMeta>;

  readonly registers = new Uint16Array(65536);
  readonly coils     = new Uint8Array(65536);
  readonly coilMeta  = new Map<number, CoilMeta>();

  constructor(readonly unitId: number) {}

  abstract init(): void;
  abstract tick(dt: number): void;

  onWrite(_addr: number, _val: number): void {}
  onCoilWrite(_addr: number, _val: boolean): void {}

  protected set(addr: number, val: number): void {
    this.registers[addr] = val & 0xFFFF;
  }

  protected noise(amp: number): number {
    return (Math.random() - 0.5) * 2 * amp;
  }

  protected clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }
}
