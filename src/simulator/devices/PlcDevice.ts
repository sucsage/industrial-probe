import { BaseDevice, RegMeta, CoilMeta } from './types.js';

/**
 * Generic PLC simulation.
 * Holding Registers:
 *   0–3   Analog Inputs 1–4  (mA × 100, 4.00–20.00 mA)
 *  10–11  Analog Outputs 1–2 (mA × 100)  writable
 *  20–21  Counters 1–2
 *  30     Scan Time (ms)
 * Coils:
 *   0–7   Digital Inputs DI1–DI8
 *  10–13  Digital Outputs DO1–DO4  writable
 */
export class PlcDevice extends BaseDevice {
  name       = 'PLC';
  deviceType = 'plc';

  readonly regMeta = new Map<number, RegMeta>([
    [0,  { label: 'Analog In 1',  unit: 'mA×100'              }],
    [1,  { label: 'Analog In 2',  unit: 'mA×100'              }],
    [2,  { label: 'Analog In 3',  unit: 'mA×100'              }],
    [3,  { label: 'Analog In 4',  unit: 'mA×100'              }],
    [10, { label: 'Analog Out 1', unit: 'mA×100', writable: true }],
    [11, { label: 'Analog Out 2', unit: 'mA×100', writable: true }],
    [20, { label: 'Counter 1'                                  }],
    [21, { label: 'Counter 2'                                  }],
    [30, { label: 'Scan Time',    unit: 'ms'                   }],
  ]);

  readonly coilMeta = new Map<number, CoilMeta>([
    [0,  { label: 'DI 1' }], [1,  { label: 'DI 2' }],
    [2,  { label: 'DI 3' }], [3,  { label: 'DI 4' }],
    [4,  { label: 'DI 5' }], [5,  { label: 'DI 6' }],
    [6,  { label: 'DI 7' }], [7,  { label: 'DI 8' }],
    [10, { label: 'DO 1', writable: true }],
    [11, { label: 'DO 2', writable: true }],
    [12, { label: 'DO 3', writable: true }],
    [13, { label: 'DO 4', writable: true }],
  ]);

  private counters = [0, 0];
  private elapsed  = 0;
  private aiBase   = [4.0, 8.0, 12.0, 16.0];

  init(): void {
    this.set(10, 1200);
    this.set(11, 1600);
    this.set(30, 5);
  }

  tick(dt: number): void {
    this.elapsed += dt;

    for (let i = 0; i < 4; i++) {
      const val = this.aiBase[i] + Math.sin(this.elapsed / 3000 + i * 1.5) * 2 + this.noise(0.05);
      this.set(i, Math.round(this.clamp(val, 4, 20) * 100));
    }

    if (this.elapsed % 500 < dt) this.set(20, ++this.counters[0] & 0xFFFF);
    if (this.elapsed % 1300 < dt) this.set(21, ++this.counters[1] & 0xFFFF);

    // DI randomly toggle with low probability
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.0005 * (dt / 100)) this.coils[i] ^= 1;
    }

    this.set(30, 5 + Math.round(this.noise(1)));
  }
}
