import { BaseDevice, RegMeta } from './types.js';

/**
 * VFD / Inverter simulation.
 * Registers (0-based = Modbus addr, display = addr+40001):
 *   0  Speed Setpoint (RPM)   writable
 *   1  Speed Actual   (RPM)
 *   2  Fault Code
 *   3  Status Word            bit0=running bit1=fault bit2=at-speed
 *   9  Motor Temperature (°C)
 *  10  Ambient Temperature (°C)
 *  19  Output Frequency  (Hz)
 *  20  Output Current    (A)
 *  21  DC Bus Voltage    (V)
 *  29  Run Command              writable  0=stop 1=run
 *  39  Accel Time        (s)   writable
 *  40  Decel Time        (s)   writable
 *  49  Power             (×10 kW)
 */
export class MotorDrive extends BaseDevice {
  name       = 'Motor Drive (VFD)';
  deviceType = 'motor-drive';

  readonly regMeta = new Map<number, RegMeta>([
    [0,  { label: 'Speed Setpoint',   unit: 'RPM', writable: true  }],
    [1,  { label: 'Speed Actual',     unit: 'RPM'                  }],
    [2,  { label: 'Fault Code'                                      }],
    [3,  { label: 'Status Word'                                     }],
    [9,  { label: 'Motor Temp',       unit: '°C'                   }],
    [10, { label: 'Ambient Temp',     unit: '°C'                   }],
    [19, { label: 'Output Frequency', unit: 'Hz'                   }],
    [20, { label: 'Output Current',   unit: 'A×10'                 }],
    [21, { label: 'DC Bus Voltage',   unit: 'V'                    }],
    [29, { label: 'Run Command',                  writable: true    }],
    [39, { label: 'Accel Time',       unit: 's',  writable: true   }],
    [40, { label: 'Decel Time',       unit: 's',  writable: true   }],
    [49, { label: 'Power',            unit: 'kW×10'                }],
  ]);

  private speedSP   = 0;
  private speedAct  = 0.0;
  private runCmd    = 0;
  private temp      = 25.0;
  private accelTime = 10;
  private decelTime = 10;

  init(): void {
    this.set(10, 25);
    this.set(21, 540);
    this.set(39, 10);
    this.set(40, 10);
  }

  tick(dt: number): void {
    const target = this.runCmd ? this.speedSP : 0;
    const ramp   = (1500 / (this.runCmd ? this.accelTime : this.decelTime)) * (dt / 1000);

    if      (this.speedAct < target) this.speedAct = Math.min(target, this.speedAct + ramp);
    else if (this.speedAct > target) this.speedAct = Math.max(target, this.speedAct - ramp);

    // Temperature: rises toward 80°C at full load, cools at ambient
    const tempTarget = 25 + (this.speedAct / 1500) * 55;
    this.temp += (tempTarget - this.temp) * 0.001 * (dt / 100) + this.noise(0.02);
    this.temp = this.clamp(this.temp, 20, 95);

    const running  = this.speedAct > 10;
    const atSpeed  = Math.abs(this.speedAct - target) < 5;
    const status   = (running ? 1 : 0) | (atSpeed && running ? 4 : 0);
    const freq     = this.speedAct / 25;
    const current  = running ? 2 + (this.speedAct / 1500) * 13 + this.noise(0.5) : 0;
    const power    = freq * current * 0.1;

    this.set(0,  Math.round(this.speedSP));
    this.set(1,  Math.round(this.speedAct));
    this.set(2,  0);
    this.set(3,  status);
    this.set(9,  Math.round(this.temp));
    this.set(10, 25);
    this.set(19, Math.round(freq));
    this.set(20, Math.round(current * 10));
    this.set(21, 540 + Math.round(this.noise(8)));
    this.set(29, this.runCmd);
    this.set(39, this.accelTime);
    this.set(40, this.decelTime);
    this.set(49, Math.round(power * 10));
  }

  onWrite(addr: number, value: number): void {
    switch (addr) {
      case 0:  this.speedSP   = this.clamp(value, 0, 1500); break;
      case 29: this.runCmd    = value ? 1 : 0;              break;
      case 39: this.accelTime = Math.max(1, value);         break;
      case 40: this.decelTime = Math.max(1, value);         break;
    }
  }
}
