import { SimDevice } from './devices/types.js';

export class DeviceRegistry {
  private devices = new Map<number, SimDevice>(); // unitId → device

  register(device: SimDevice): void {
    this.devices.set(device.unitId, device);
    device.init();
  }

  unregister(unitId: number): void {
    this.devices.delete(unitId);
  }

  tick(dt: number): void {
    for (const d of this.devices.values()) d.tick(dt);
  }

  getHolding(unitId: number, address: number): number {
    return this.devices.get(unitId)?.registers[address] ?? 0;
  }

  setHolding(unitId: number, address: number, value: number): void {
    const d = this.devices.get(unitId);
    if (!d) return;
    d.registers[address] = value & 0xFFFF;
    d.onWrite(address, value);
  }

  getCoil(unitId: number, address: number): boolean {
    return !!(this.devices.get(unitId)?.coils[address]);
  }

  setCoil(unitId: number, address: number, value: boolean): void {
    const d = this.devices.get(unitId);
    if (!d) return;
    d.coils[address] = value ? 1 : 0;
    d.onCoilWrite(address, value);
  }

  getAll(): SimDevice[] {
    return [...this.devices.values()];
  }

  get(unitId: number): SimDevice | undefined {
    return this.devices.get(unitId);
  }

  get size(): number {
    return this.devices.size;
  }
}
