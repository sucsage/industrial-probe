import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Header } from '../components/Header';
import { FormField } from '../components/FormField';
import { ModbusRTUClient } from '../../protocols/modbus';
import { RtuScanPanel }    from './rtu/RtuScanPanel';
import { RtuReadPanel }    from './rtu/RtuReadPanel';
import { RtuWritePanel }   from './rtu/RtuWritePanel';
import { RtuMonitorPanel } from './rtu/RtuMonitorPanel';
import { RtuMapPanel }     from './rtu/RtuMapPanel';
import { RtuTestPanel }    from './rtu/RtuTestPanel';
import { RtuLogPanel }     from './rtu/RtuLogPanel';

type Phase     = 'form' | 'connecting' | 'hub' | 'error';
type SubScreen = 'menu' | 'scan' | 'read' | 'write' | 'monitor' | 'regmap' | 'test' | 'log';

const CONN_FIELDS = ['port', 'baud', 'parity', 'stopBits', 'unitId'] as const;
type ConnKey = typeof CONN_FIELDS[number];

const LABELS: Record<ConnKey, string> = {
  port:     'Serial port',
  baud:     'Baud rate',
  parity:   'Parity',
  stopBits: 'Stop bits',
  unitId:   'Unit ID',
};

const DEFAULTS: Record<ConnKey, string> = {
  port:     '/dev/ttyUSB0',
  baud:     '9600',
  parity:   'none',
  stopBits: '1',
  unitId:   '1',
};

const HINTS: Partial<Record<ConnKey, string>> = {
  parity: 'none / even / odd',
};

const HUB_ITEMS = [
  { label: 'Scan unit IDs         — probe bus for slaves (1–247)', value: 'scan' },
  { label: 'Read registers        — read holding registers',        value: 'read' },
  { label: 'Write register        — write a value to a register',   value: 'write' },
  { label: 'Monitor (live)        — poll registers continuously',   value: 'monitor' },
  { label: 'Register map          — scan & discover register map',  value: 'regmap' },
  { label: 'Run test suite        — run YAML test file',            value: 'test' },
  { label: 'Log to CSV            — log register values to file',   value: 'log' },
  { label: 'Disconnect',                                            value: '__disconnect__' },
];

export function RtuScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase]         = useState<Phase>('form');
  const [sub, setSub]             = useState<SubScreen>('menu');
  const [fieldIdx, setFieldIdx]   = useState(0);
  const [conn, setConn]           = useState<Record<ConnKey, string>>({ ...DEFAULTS });
  const [error, setError]         = useState('');
  const clientRef = useRef<ModbusRTUClient | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; clientRef.current?.disconnect(); };
  }, []);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                        setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < CONN_FIELDS.length - 1)   setFieldIdx(f => f + 1);
    } else if (phase === 'error') {
      if (key.escape) onBack();
    }
    // hub ESC handled by each panel's onBack → setSub('menu')
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < CONN_FIELDS.length - 1) setFieldIdx(idx + 1);
    else connect();
  };

  const connect = async () => {
    setPhase('connecting');
    const client = new ModbusRTUClient({
      port:     conn.port,
      baudRate: parseInt(conn.baud),
      parity:   (conn.parity as any) || 'none',
      stopBits: parseInt(conn.stopBits),
      unitId:   parseInt(conn.unitId),
    });
    clientRef.current = client;
    try {
      await client.connect();
      if (isMounted.current) { setPhase('hub'); setSub('menu'); }
    } catch (err: any) {
      if (isMounted.current) { setError(err.message); setPhase('error'); }
    }
  };

  const disconnect = () => {
    clientRef.current?.disconnect();
    onBack();
  };

  const handleHubSelect = (item: { value: string }) => {
    if (item.value === '__disconnect__') { disconnect(); return; }
    setSub(item.value as SubScreen);
  };

  const client = clientRef.current!;

  return (
    <Box flexDirection="column">

      {/* ── Connection form ── */}
      {phase === 'form' && (
        <>
          <Header title="Modbus RTU — Connect" />
          <Box flexDirection="column">
            {CONN_FIELDS.map((f, i) => (
              <Box key={f} flexDirection="column">
                <FormField
                  label={LABELS[f]}
                  value={conn[f]}
                  focus={fieldIdx === i}
                  onChange={v => setConn(prev => ({ ...prev, [f]: v }))}
                  onSubmit={handleSubmit(i)}
                  placeholder={DEFAULTS[f]}
                />
                {fieldIdx === i && HINTS[f] && (
                  <Box paddingLeft={16}><Text dimColor>{HINTS[f]}</Text></Box>
                )}
              </Box>
            ))}
            <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/connect · ESC back</Text></Box>
          </Box>
        </>
      )}

      {/* ── Connecting ── */}
      {phase === 'connecting' && (
        <Box flexDirection="column">
          <Header title="Modbus RTU" />
          <Text color="yellow">Connecting to {conn.port}...</Text>
        </Box>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <Box flexDirection="column">
          <Header title="Modbus RTU" />
          <Text color="red">{'✗ ' + error}</Text>
          <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
        </Box>
      )}

      {/* ── Hub submenu ── */}
      {phase === 'hub' && sub === 'menu' && (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold color="yellow">Modbus RTU  <Text color="gray">{conn.port} · {conn.baud} baud · unit {conn.unitId}</Text></Text>
            <Text color="gray">{'─'.repeat(50)}</Text>
          </Box>
          <Box borderStyle="round" borderColor="gray" paddingX={1}>
            <SelectInput items={HUB_ITEMS} onSelect={handleHubSelect} />
          </Box>
          <Text dimColor>↑↓ navigate · Enter select · Disconnect to exit</Text>
        </Box>
      )}

      {/* ── Panels ── */}
      {phase === 'hub' && sub === 'scan'    && <RtuScanPanel    client={client} defaultUnitId={parseInt(conn.unitId)} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'read'    && <RtuReadPanel    client={client} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'write'   && <RtuWritePanel   client={client} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'monitor' && <RtuMonitorPanel client={client} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'regmap'  && <RtuMapPanel     client={client} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'test'    && <RtuTestPanel    client={client} onBack={() => setSub('menu')} />}
      {phase === 'hub' && sub === 'log'     && <RtuLogPanel     client={client} onBack={() => setSub('menu')} />}

    </Box>
  );
}
