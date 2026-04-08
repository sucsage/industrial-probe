import { BaseDevice, RegMeta } from './types.js';

/**
 * Pressure + Flow transmitter simulation.
 *   0  Pressure PV     (bar × 10)
 *   1  Flow Rate PV    (L/min × 10)
 *   2  High Alarm SP   (bar × 10)  writable
 *   3  Low  Alarm SP   (bar × 10)  writable
 *   4  Status                       bit0=hi-alarm bit1=lo-alarm
 *   5  Device ID       (0x0042)
 *   6  Firmware        (0x0105)
 *   9  Pressure × 100  (higher precision)
 *  10  Temp            (°C)
 */
export class Transmitter extends BaseDevice {
  name       = 'Pressure Transmitter';
  deviceType = 'transmitter';

  readonly regMeta = new Map<number, RegMeta>([
    [0,  { label: 'Pressure PV',   unit: 'bar×10'              }],
    [1,  { label: 'Flow Rate PV',  unit: 'L/min×10'            }],
    [2,  { label: 'High Alarm SP', unit: 'bar×10', writable: true }],
    [3,  { label: 'Low  Alarm SP', unit: 'bar×10', writable: true }],
    [4,  { label: 'Status'                                      }],
    [5,  { label: 'Device ID'                                   }],
    [6,  { label: 'Firmware Rev'                                }],
    [9,  { label: 'Pressure ×100', unit: 'bar×100'             }],
    [10, { label: 'Sensor Temp',   unit: '°C'                  }],
  ]);

  private hiAlarm  = 80;
  private loAlarm  = 10;
  private elapsed  = 0;

  init(): void {
    this.set(2, this.hiAlarm);
    this.set(3, this.loAlarm);
    this.set(5, 0x0042);
    this.set(6, 0x0105);
    this.set(10, 25);
  }

  tick(dt: number): void {
    this.elapsed += dt;

    const pressure = 5.0
      + Math.sin(this.elapsed / 5000) * 1.5
      + Math.sin(this.elapsed / 1200) * 0.3
      + this.noise(0.04);

    const flow = 100
      + Math.sin(this.elapsed / 3000) * 20
      + Math.sin(this.elapsed / 800)  * 3
      + this.noise(0.8);

    const sensorTemp = 25 + Math.sin(this.elapsed / 60000) * 3 + this.noise(0.05);

    const hiAl  = pressure * 10 > this.hiAlarm ? 1 : 0;
    const loAl  = pressure * 10 < this.loAlarm ? 2 : 0;

    this.set(0,  Math.round(pressure * 10));
    this.set(1,  Math.round(this.clamp(flow, 0, 999) * 10));
    this.set(2,  this.hiAlarm);
    this.set(3,  this.loAlarm);
    this.set(4,  hiAl | loAl);
    this.set(5,  0x0042);
    this.set(6,  0x0105);
    this.set(9,  Math.round(pressure * 100));
    this.set(10, Math.round(sensorTemp));
  }

  onWrite(addr: number, value: number): void {
    if (addr === 2) this.hiAlarm = value;
    if (addr === 3) this.loAlarm = value;
  }
}
