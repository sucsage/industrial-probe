import { BaseDevice, RegMeta } from './types.js';

/**
 * PID Temperature Controller simulation.
 *   0  PV — Process Value (°C)
 *   1  SP — Setpoint      (°C)  writable
 *   2  Output             (%)   0–100
 *   3  Status                   bit0=hi-alarm bit1=lo-alarm bit2=running
 *   4  High Alarm SP      (°C)  writable
 *   5  Low  Alarm SP      (°C)  writable
 *   6  Proportional Band  (°C)  writable
 *   7  Integral Time      (s)   writable
 *  10  PV × 10  (higher precision)
 */
export class TempController extends BaseDevice {
  name       = 'Temp Controller';
  deviceType = 'temp-controller';

  readonly regMeta = new Map<number, RegMeta>([
    [0,  { label: 'PV (Actual)',    unit: '°C'               }],
    [1,  { label: 'SP (Setpoint)', unit: '°C', writable: true }],
    [2,  { label: 'Output',        unit: '%'                  }],
    [3,  { label: 'Status'                                    }],
    [4,  { label: 'High Alarm SP', unit: '°C', writable: true }],
    [5,  { label: 'Low  Alarm SP', unit: '°C', writable: true }],
    [6,  { label: 'Prop Band',     unit: '°C', writable: true }],
    [7,  { label: 'Integral Time', unit: 's',  writable: true }],
    [10, { label: 'PV × 10',       unit: '°C×10'             }],
  ]);

  private sp       = 150;
  private pv       = 25.0;
  private output   = 0.0;
  private hiAlarm  = 200;
  private loAlarm  = 50;
  private pBand    = 20;
  private iTi      = 60;
  private integral = 0.0;

  init(): void {
    this.set(1,  this.sp);
    this.set(4,  this.hiAlarm);
    this.set(5,  this.loAlarm);
    this.set(6,  this.pBand);
    this.set(7,  this.iTi);
  }

  tick(dt: number): void {
    const dtSec = dt / 1000;
    const err   = this.sp - this.pv;

    // PI controller
    this.integral += err * dtSec;
    const pOut = err / this.pBand;
    const iOut = (this.iTi > 0) ? this.integral / this.iTi : 0;
    this.output = this.clamp((pOut + iOut) * 100, 0, 100);

    // Thermal model: heating from output, natural cooling to ambient (25°C)
    const heat = this.output * 0.0005 * dtSec * 10;
    const cool = (this.pv - 25) * 0.00008 * dtSec * 10;
    this.pv   += heat - cool + this.noise(0.02);

    const hiAl  = this.pv > this.hiAlarm ? 1 : 0;
    const loAl  = this.pv < this.loAlarm ? 2 : 0;
    const status = hiAl | loAl | 4; // always "running"

    this.set(0,  Math.round(this.pv));
    this.set(1,  this.sp);
    this.set(2,  Math.round(this.output));
    this.set(3,  status);
    this.set(4,  this.hiAlarm);
    this.set(5,  this.loAlarm);
    this.set(6,  this.pBand);
    this.set(7,  this.iTi);
    this.set(10, Math.round(this.pv * 10));
  }

  onWrite(addr: number, value: number): void {
    switch (addr) {
      case 1: this.sp      = value; this.integral = 0; break;
      case 4: this.hiAlarm = value;                    break;
      case 5: this.loAlarm = value;                    break;
      case 6: this.pBand   = Math.max(1, value);       break;
      case 7: this.iTi     = Math.max(1, value);       break;
    }
  }
}
