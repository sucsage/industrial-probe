import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header }         from '../components/Header.js';
import { FormField }      from '../components/FormField.js';
import { DeviceRegistry } from '../../simulator/DeviceRegistry.js';
import { ModbusTcpServer} from '../../simulator/ModbusTcpServer.js';
import { ModbusRtuServer} from '../../simulator/ModbusRtuServer.js';
import { MotorDrive }     from '../../simulator/devices/MotorDrive.js';
import { ServoController }from '../../simulator/devices/ServoController.js';
import { PlcDevice }      from '../../simulator/devices/PlcDevice.js';
import { TempController } from '../../simulator/devices/TempController.js';
import { Transmitter }    from '../../simulator/devices/Transmitter.js';
import { SimDevice }      from '../../simulator/devices/types.js';

type Phase = 'config' | 'running' | 'error';

// ── Device catalogue ──────────────────────────────────────────────────────────

const CATALOGUE = [
  { key: 'motor',  label: 'Motor Drive (VFD)',    factory: (uid: number) => new MotorDrive(uid) },
  { key: 'servo',  label: 'Servo Controller',     factory: (uid: number) => new ServoController(uid) },
  { key: 'plc',    label: 'PLC',                  factory: (uid: number) => new PlcDevice(uid) },
  { key: 'temp',   label: 'Temp Controller',      factory: (uid: number) => new TempController(uid) },
  { key: 'xmit',  label: 'Pressure Transmitter',  factory: (uid: number) => new Transmitter(uid) },
] as const;

const FC_NAME: Record<number, string> = {
  1: 'Read Coils', 2: 'Read DI', 3: 'Read HR', 4: 'Read IR',
  5: 'Write Coil', 6: 'Write Reg', 16: 'Write Multi',
};

// ── Main component ────────────────────────────────────────────────────────────

export function SimulatorScreen({ onBack }: { onBack: () => void }) {
  // Config state
  const [cursor, setCursor]       = useState(0);
  const [selected, setSelected]   = useState(new Set<string>(['motor']));
  const [tcpPort, setTcpPort]     = useState('502');
  const [configField, setConfigField] = useState<'devices' | 'port'>('devices');
  const [socatOk, setSocatOk]     = useState<boolean | null>(null);

  // Runtime state
  const [phase, setPhase]         = useState<Phase>('config');
  const [tick, setTick]           = useState(0);
  const [devIdx, setDevIdx]       = useState(0);
  const [tcpClients, setTcpClients] = useState(0);
  const [rtuPath, setRtuPath]     = useState('');
  const [rtuRunning, setRtuRunning] = useState(false);
  const [error, setError]         = useState('');
  const [logLines, setLogLines]   = useState<string[]>([]);

  const registryRef = useRef<DeviceRegistry | null>(null);
  const tcpRef      = useRef<ModbusTcpServer | null>(null);
  const rtuRef      = useRef<ModbusRtuServer | null>(null);
  const tickTimer   = useRef<NodeJS.Timeout | null>(null);
  const isMounted   = useRef(true);

  // Check socat on mount
  useEffect(() => {
    ModbusRtuServer.isSocatAvailable().then(ok => { if (isMounted.current) setSocatOk(ok); });
    return () => {
      isMounted.current = false;
      shutdown();
    };
  }, []);

  const shutdown = () => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    tcpRef.current?.close().catch(() => {});
    rtuRef.current?.stop();
  };

  // ── Input handling ──────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (phase === 'config') {
      if (key.escape) { onBack(); return; }

      if (configField === 'devices') {
        if (key.upArrow   && cursor > 0)                    setCursor(c => c - 1);
        if (key.downArrow && cursor < CATALOGUE.length - 1) setCursor(c => c + 1);
        if (input === ' ' || key.return) {
          const k = CATALOGUE[cursor].key;
          setSelected(s => {
            const n = new Set(s);
            n.has(k) ? n.delete(k) : n.add(k);
            return n;
          });
        }
        if (key.tab) setConfigField('port');
        if (input === 's' || input === 'S') startSimulator();
      }
      return;
    }

    if (phase === 'running') {
      if (key.escape) { shutdown(); setPhase('config'); return; }
      const devices = registryRef.current?.getAll() ?? [];
      if (key.tab || key.rightArrow) setDevIdx(i => (i + 1) % Math.max(1, devices.length));
      if (key.leftArrow)             setDevIdx(i => (i - 1 + Math.max(1, devices.length)) % Math.max(1, devices.length));
    }

    if (phase === 'error') {
      if (key.escape) { setPhase('config'); setError(''); }
    }
  });

  // ── Simulator startup ───────────────────────────────────────────────────────

  const startSimulator = async () => {
    const registry = new DeviceRegistry();
    registryRef.current = registry;

    // Register selected devices with sequential unit IDs
    let uid = 1;
    for (const entry of CATALOGUE) {
      if (selected.has(entry.key)) {
        registry.register(entry.factory(uid++));
      }
    }

    if (registry.size === 0) return;

    // Start TCP server
    const tcp = new ModbusTcpServer(registry);
    tcpRef.current = tcp;
    try {
      await tcp.listen(parseInt(tcpPort) || 502);
    } catch (e: any) {
      setError('TCP listen failed: ' + e.message);
      setPhase('error');
      return;
    }

    // Optionally start RTU
    if (socatOk) {
      const rtu = new ModbusRtuServer(registry);
      rtuRef.current = rtu;
      try {
        await rtu.start(9600);
        if (isMounted.current) { setRtuPath(rtu.clientPath); setRtuRunning(true); }
      } catch {
        // RTU optional — continue without it
      }
    }

    // Tick loop: advance simulation every 100ms, update React state every 200ms
    let renderBeat = 0;
    tickTimer.current = setInterval(() => {
      registry.tick(100);
      renderBeat++;
      if (renderBeat >= 2) {
        renderBeat = 0;
        if (isMounted.current) {
          setTcpClients(tcp.connectionCount);
          setLogLines(tcp.recentLog.map(r =>
            `${r.ts}  unit${r.unitId}  FC${r.fc}(${FC_NAME[r.fc] ?? '?'})  @${40001 + r.addr}` +
            (r.write !== undefined ? `  ← ${r.write}` : `  ×${r.count}`)
          ));
          setTick(t => t + 1);
        }
      }
    }, 100);

    setPhase('running');
    setDevIdx(0);
  };

  // ── Render: Config ──────────────────────────────────────────────────────────

  if (phase === 'config') {
    return (
      <Box flexDirection="column">
        <Header title="Simulator — Config" />

        <Box flexDirection="column" gap={0}>
          <Text color="gray" bold>Select devices  <Text dimColor>(Space toggle · Tab → port · S start)</Text></Text>
          {CATALOGUE.map((d, i) => (
            <Box key={d.key}>
              <Text color={i === cursor ? 'cyan' : 'gray'}>{i === cursor ? '▶ ' : '  '}</Text>
              <Text color={selected.has(d.key) ? 'green' : 'gray'}>
                {selected.has(d.key) ? '[✓] ' : '[ ] '}
              </Text>
              <Text color={i === cursor ? 'white' : 'gray'}>{d.label}</Text>
              <Text color="gray">{' unit ' + (([...CATALOGUE].filter((_, j) => j <= i && selected.has(CATALOGUE[j].key)).length))}</Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <FormField
            label="TCP Port"
            value={tcpPort}
            focus={configField === 'port'}
            onChange={setTcpPort}
            onSubmit={startSimulator}
            placeholder="502"
          />
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="gray">RTU (socat): </Text>
            {socatOk === null && <Text dimColor>checking...</Text>}
            {socatOk === true  && <Text color="green">available — will auto-start</Text>}
            {socatOk === false && <Text color="yellow">not found  </Text>}
            {socatOk === false && <Text dimColor>brew install socat</Text>}
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>↑↓ device · Space toggle · Tab → port · S start · ESC back</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Error ───────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Header title="Simulator" />
        <Text color="red">{'✗ ' + error}</Text>
        <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
      </Box>
    );
  }

  // ── Render: Running ─────────────────────────────────────────────────────────

  const registry  = registryRef.current!;
  const devices   = registry.getAll();
  const device: SimDevice | undefined = devices[devIdx];

  return (
    <Box flexDirection="column">

      {/* Status bar */}
      <Box marginBottom={1} gap={2}>
        <Text bold color="yellow">▓ Simulator</Text>
        <Text><Text color="green">TCP ●</Text><Text color="gray">{' :' + tcpPort + '  ' + tcpClients + ' client(s)'}</Text></Text>
        {rtuRunning
          ? <Text><Text color="green">RTU ●</Text><Text color="gray">{' ← ' + rtuPath}</Text></Text>
          : <Text color="gray">RTU ○</Text>
        }
      </Box>

      {/* Device tabs */}
      <Box marginBottom={1}>
        {devices.map((d, i) => (
          <Box key={d.unitId} marginRight={1}>
            <Text
              color={i === devIdx ? 'cyan' : 'gray'}
              bold={i === devIdx}
            >
              {i === devIdx ? '[' : ' '}
              {d.name + ' u' + d.unitId}
              {i === devIdx ? ']' : ' '}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Register table */}
      {device && (
        <Box flexDirection="column">
          <Box>
            <Text color="gray" bold>{'Address'.padEnd(10)}</Text>
            <Text color="gray" bold>{'Label'.padEnd(22)}</Text>
            <Text color="gray" bold>{'Value'.padEnd(8)}</Text>
            <Text color="gray" bold>Unit</Text>
          </Box>
          <Text color="gray">{'─'.repeat(54)}</Text>

          {[...device.regMeta.entries()].map(([addr, meta]) => {
            const val = device.registers[addr];
            return (
              <Box key={addr}>
                <Text color="yellow">{('4' + String(addr + 1).padStart(4, '0')).padEnd(10)}</Text>
                <Text color={meta.writable ? 'cyan' : 'white'}>{meta.label.padEnd(22)}</Text>
                <Text color="white">{String(val).padEnd(8)}</Text>
                <Text color="gray">{meta.unit ?? ''}{meta.writable ? ' ✎' : ''}</Text>
              </Box>
            );
          })}

          {/* Coils (if any) */}
          {device.coilMeta.size > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="gray">{'─'.repeat(54)}</Text>
              <Text color="gray" dimColor>Coils</Text>
              <Box flexWrap="wrap">
                {[...device.coilMeta.entries()].map(([addr, meta]) => (
                  <Box key={addr} marginRight={2}>
                    <Text color={device.coils[addr] ? 'green' : 'gray'}>
                      {device.coils[addr] ? '●' : '○'}
                    </Text>
                    <Text color="gray">{' ' + meta.label}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Request log */}
      {logLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" dimColor>Recent requests</Text>
          {logLines.map((l, i) => <Text key={i} dimColor>{l}</Text>)}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{'← → Tab switch device · ESC stop'}</Text>
      </Box>
    </Box>
  );
}
