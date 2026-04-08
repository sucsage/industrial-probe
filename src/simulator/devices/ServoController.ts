import { BaseDevice, RegMeta } from './types.js';

/**
 * Servo drive simulation (incremental encoder, position mode).
 *   0  Control Word             writable  bit0=enable bit1=reset-fault
 *   1  Status Word              bit0=enabled bit1=at-target bit2=fault
 *   9  Actual Position (cnt)
 *  10  Position Setpoint (cnt)  writable
 *  19  Actual Speed    (RPM)
 *  20  Speed Limit     (RPM)    writable
 *  29  Actual Torque   (%)
 *  30  Torque Limit    (%)      writable
 *  39  Following Error (cnt)
 *  40  Position Window (cnt)    writable — tolerance for "at-target"
 *  49  Fault Code
 *  50  Drive Temperature (°C)
 */
export class ServoController extends BaseDevice {
  name       = 'Servo Controller';
  deviceType = 'servo';

  readonly regMeta = new Map<number, RegMeta>([
    [0,  { label: 'Control Word',     writable: true  }],
    [1,  { label: 'Status Word'                       }],
    [9,  { label: 'Actual Position',  unit: 'cnt'     }],
    [10, { label: 'Position SP',      unit: 'cnt', writable: true }],
    [19, { label: 'Actual Speed',     unit: 'RPM'     }],
    [20, { label: 'Speed Limit',      unit: 'RPM', writable: true }],
    [29, { label: 'Actual Torque',    unit: '%'       }],
    [30, { label: 'Torque Limit',     unit: '%',  writable: true }],
    [39, { label: 'Following Error',  unit: 'cnt'     }],
    [40, { label: 'Position Window',  unit: 'cnt', writable: true }],
    [49, { label: 'Fault Code'                        }],
    [50, { label: 'Drive Temp',       unit: '°C'      }],
  ]);

  private ctrlWord   = 0;
  private posAct     = 0.0;
  private posSP      = 0;
  private speedAct   = 0.0;
  private speedLimit = 3000;
  private torqueLimit = 100;
  private posWindow  = 5;
  private temp       = 30.0;
  private fault      = 0;

  init(): void {
    this.set(20, 3000);
    this.set(30, 100);
    this.set(40, 5);
    this.set(50, 30);
  }

  tick(dt: number): void {
    const enabled = !!(this.ctrlWord & 0x01);
    const resetFault = !!(this.ctrlWord & 0x02);
    if (resetFault) this.fault = 0;

    if (enabled) {
      const diff     = this.posSP - this.posAct;
      const maxMove  = (this.speedLimit / 60) * (dt / 1000) * 1000; // cnt/ms
      const move     = this.clamp(diff, -maxMove, maxMove);
      this.posAct   += move;
      this.speedAct  = Math.abs(move / (dt / 1000) / 1000 * 60);
      this.temp     += 0.002 * (dt / 100) + this.noise(0.01);
    } else {
      this.speedAct  = 0;
      this.temp     -= 0.001 * (dt / 100);
    }
    this.temp = this.clamp(this.temp, 25, 90);

    const err      = this.posSP - Math.round(this.posAct);
    const atTarget = Math.abs(err) <= this.posWindow;
    const torque   = enabled && Math.abs(err) > this.posWindow
      ? this.clamp(30 + this.noise(5), 0, this.torqueLimit)
      : (enabled ? 5 + this.noise(2) : 0);

    const status = (enabled ? 1 : 0) | (atTarget && enabled ? 2 : 0) | (this.fault ? 4 : 0);

    this.set(1,  status);
    this.set(9,  Math.round(this.posAct) & 0xFFFF);
    this.set(10, this.posSP & 0xFFFF);
    this.set(19, Math.round(this.speedAct));
    this.set(20, this.speedLimit);
    this.set(29, Math.round(torque));
    this.set(30, this.torqueLimit);
    this.set(39, Math.abs(err));
    this.set(40, this.posWindow);
    this.set(49, this.fault);
    this.set(50, Math.round(this.temp));
  }

  onWrite(addr: number, value: number): void {
    switch (addr) {
      case 0:  this.ctrlWord    = value;                          break;
      case 10: this.posSP       = value;                          break;
      case 20: this.speedLimit  = Math.max(1, value);             break;
      case 30: this.torqueLimit = this.clamp(value, 0, 300);      break;
      case 40: this.posWindow   = Math.max(1, value);             break;
    }
  }
}
