# industrial-probe

TUI (Terminal User Interface) สำหรับทดสอบและ debug อุปกรณ์อุตสาหกรรม — Modbus TCP, Modbus RTU (RS-485), MQTT พร้อม Simulator ในตัว

```
▓▓▓ industrial-probe v0.1.0
▓▓▓ TUI for PLC / Modbus / MQTT / Simulator

── Modbus TCP ────────────────────────────────────
  Scan subnet           — find devices on network
  Read registers        — read holding registers
  Write register        — write a value to a register
  Monitor (live)        — poll registers in real-time
  Register map          — scan & discover all registers
── Modbus RTU (Serial) ───────────────────────────
  RTU Read / Monitor    — RS-485 serial connection
── MQTT ──────────────────────────────────────────
  MQTT Subscribe/Publish — connect to broker
── Tools ─────────────────────────────────────────
  Run test suite        — run YAML test file
  Log to CSV            — log register values to file
── Simulator ─────────────────────────────────────
  Launch simulator      — virtual Modbus device server
```

---

## Requirements

| Dependency | Version | Required | Purpose |
|---|---|---|---|
| Node.js | ≥ 18 | ✅ | runtime |
| pnpm | any | ✅ | package manager |
| socat | any | ⚠ optional | RTU simulator virtual serial ports |
| serialport (native) | — | ⚠ optional | RTU client/server |

### ติดตั้ง dependencies บน macOS
```bash
brew install node socat
npm install -g pnpm
```

### ติดตั้ง dependencies บน Linux (Debian/Ubuntu)
```bash
sudo apt install nodejs npm socat
npm install -g pnpm
```

---

## Installation

```bash
git clone <repo-url>
cd industrial-probe
pnpm install

# เปิดใช้ RTU (serial port native bindings)
pnpm approve-builds
```

## Run

```bash
pnpm dev
```

ทุกครั้งที่เปิดแอป จะตรวจ dependencies อัตโนมัติก่อนเข้า menu:

```
Dependency check
────────────────────────────────────────────────────────────
✓  Node.js                v24.14.0        runtime
✓  modbus-serial          v8.0.25         Modbus TCP/RTU client
⚠  socat                  not found       RTU simulator
⚠  serialport (native)    bindings not built  RTU simulator/client
✓  mqtt                   v5.15.1         MQTT subscribe/publish

  socat:              brew install socat  (optional — RTU sim only)
  serialport (native): pnpm approve-builds  (optional — RTU only)

Optional deps missing — TCP features work without them.
Enter to continue (auto in 2s)
```

---

## Features

### Modbus TCP

| Feature | คำอธิบาย |
|---|---|
| **Scan subnet** | ค้นหาอุปกรณ์ Modbus TCP ใน subnet เช่น `192.168.1.0/24` |
| **Read registers** | อ่าน holding registers ระบุ host, port, register, count, unit ID |
| **Write register** | เขียนค่าลง holding register |
| **Monitor (live)** | poll registers แบบ realtime พร้อม bar graph |
| **Register map** | สแกน range ของ registers — แสดงว่าตัวไหน readable, กด `w` เปิด watch mode |

### Modbus RTU (RS-485 Serial)

เชื่อมต่อ serial port ครั้งเดียว แล้วเลือก operation จาก hub menu:

| Feature | คำอธิบาย |
|---|---|
| **Scan unit IDs** | probe unit ID 1–247 บน RS-485 bus |
| **Read** | อ่าน registers ระบุ unit ID |
| **Write** | เขียน register ระบุ unit ID |
| **Monitor** | live polling ระบุ unit ID |
| **Register map** | สแกน + watch mode |
| **Test suite** | รัน YAML test (รองรับ per-test unit ID override) |
| **Log to CSV** | log ค่าลง CSV file ตาม duration |

**ต้องการ:** serial adapter (USB-to-RS485) + `pnpm approve-builds`

### MQTT

- **Subscribe** — กรอก broker host/port/topic แล้วดู live messages (รองรับ wildcard `#`, `+`)
- **Publish** — กด `p` ขณะ subscribe เพื่อเปิด publish dialog

### Simulator

รัน virtual Modbus server พร้อม device simulation ในตัว — ไม่ต้องมี hardware จริง

#### Device types

| Device | Unit ID | Simulated registers |
|---|---|---|
| **Motor Drive (VFD)** | 1 | Speed SP/Actual (ramp), Fault, Temp, Frequency, Current, DC Bus, Power |
| **Servo Controller** | 2 | Position SP/Actual, Speed, Torque, Following Error, Fault, Temp |
| **PLC** | 3 | Analog In/Out (4–20mA), Digital I/O (coils), Counters, Scan Time |
| **Temp Controller** | 4 | PV/SP (PI loop simulation), Output%, Hi/Lo Alarm |
| **Pressure Transmitter** | 5 | Pressure, Flow Rate, Alarm SP, Device ID, Firmware Rev |

#### ใช้ simulator กับ probe

```
Simulator (TCP :502) ←→ probe Read/Monitor/Register map
                    ←→ probe Test suite (host: localhost)
```

**TCP** — เชื่อม `host=localhost port=502` ได้ทันที  
**RTU** — ต้องมี `socat` (`brew install socat`) จะ auto-create virtual serial pair และแสดง client port

#### ทดลอง Motor Drive

1. เปิด Simulator → เลือก "Motor Drive" → กด `S`
2. ใน probe เปิด **Write register**: host=localhost, register=40030, value=1 (Run Command)
3. เปิด **Write register**: register=40001, value=1200 (Speed Setpoint = 1200 RPM)
4. เปิด **Monitor**: register=40001, count=10 → เห็น Speed Actual ค่อยๆ ramp ขึ้น, Temp สูงขึ้น

---

## Test Suite (YAML)

### Modbus TCP

```yaml
name: "Motor Drive FAT Test"
host: 192.168.1.10
port: 502
protocol: modbus-tcp
unitId: 1

tests:
  - name: "Speed Setpoint"
    register: 40001
    expect: between(0,1500)

  - name: "Fault Code"
    register: 40002
    expect: equals(0)

  - name: "Motor Temperature"
    register: 40010
    expect: lessThan(80)

  - name: "Run Status"
    register: 40020
    expect: equals(1)
```

### Modbus RTU (ใช้ connection ที่ connect ไว้แล้ว)

```yaml
name: "Servo RTU Test"
unitId: 2

tests:
  - name: "Drive Enabled"
    register: 40002
    expect: greaterThan(0)

  - name: "No Fault"
    register: 40050
    expect: equals(0)

  - name: "Temperature OK"
    register: 40051
    expect: lessThan(85)
    unitId: 2        # override unit ID per-test ได้
```

### expect functions

| Function | ตัวอย่าง | คำอธิบาย |
|---|---|---|
| `equals(n)` | `equals(0)` | ค่าต้องเท่ากับ n |
| `lessThan(n)` | `lessThan(80)` | ค่าต้องน้อยกว่า n |
| `greaterThan(n)` | `greaterThan(0)` | ค่าต้องมากกว่า n |
| `between(lo,hi)` | `between(0,1500)` | ค่าต้องอยู่ระหว่าง lo–hi |

---

## Navigation

| Key | Action |
|---|---|
| `↑` `↓` | เลื่อน menu / เปลี่ยน field |
| `Enter` | เลือก / ไป field ถัดไป / submit |
| `ESC` | กลับ menu |
| `Tab` | switch device (Simulator, RTU hub) |
| `Space` | toggle selection (Simulator config) |
| `w` | เปิด Watch mode (Register map) |
| `p` | เปิด Publish dialog (MQTT) |
| `S` | Start (Simulator) |
| `Ctrl+C` | ออกจากโปรแกรม |

---

## Register Address Format

ใช้ระบบ 5 หลักมาตรฐาน Modbus:

| Range | ประเภท | FC |
|---|---|---|
| `40001–49999` | Holding Registers — อ่าน/เขียนได้ | FC 03/06/16 |
| `30001–39999` | Input Registers — อ่านอย่างเดียว | FC 04 |
| `1–9999` | Coils — digital output | FC 01/05 |

---

## Project Structure

```
src/
  index.ts                     entry point
  protocols/
    modbus.ts                  ModbusClient (TCP) + ModbusRTUClient (RTU)
    mqtt.ts                    MqttClientWrapper
  simulator/
    ModbusTcpServer.ts         pure Node.js Modbus TCP server (no extra deps)
    ModbusRtuServer.ts         RTU server via socat virtual serial pair
    DeviceRegistry.ts          route unitId → SimDevice
    devices/
      types.ts                 BaseDevice abstract class
      MotorDrive.ts            VFD simulation (speed ramp, thermal model)
      ServoController.ts       servo position mode (PI-like)
      PlcDevice.ts             PLC I/O (analog sin wave, digital toggle)
      TempController.ts        PI temperature controller
      Transmitter.ts           pressure + flow with realistic noise
  utils/
    parser.ts                  Modbus address + expect expression parser
  ui/
    App.tsx                    screen router
    Menu.tsx                   main menu
    components/
      Header.tsx
      FormField.tsx
    screens/
      StartupScreen.tsx        dependency check on every launch
      ScanScreen.tsx
      ReadScreen.tsx
      WriteScreen.tsx
      MonitorScreen.tsx
      RegisterMapScreen.tsx
      RtuScreen.tsx            RTU hub (connect once → submenu)
      rtu/                     RTU panels
        RtuScanPanel.tsx       scan unit IDs
        RtuReadPanel.tsx
        RtuWritePanel.tsx
        RtuMonitorPanel.tsx
        RtuMapPanel.tsx
        RtuTestPanel.tsx
        RtuLogPanel.tsx
      MqttScreen.tsx
      TestScreen.tsx
      LogScreen.tsx
      SimulatorScreen.tsx
examples/
  motor-drive.yaml             ตัวอย่าง test suite
```

---

## License

MIT
