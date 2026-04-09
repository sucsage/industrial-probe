import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header.js';
import { FormField } from '../components/FormField.js';
import { ModbusClient, RegisterResult } from '../../protocols/modbus.js';

type Phase = 'form' | 'connecting' | 'running' | 'error';

const FIELDS = ['host', 'port', 'register', 'count', 'interval'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  host:     'Host',
  port:     'Port',
  register: 'Register',
  count:    'Count',
  interval: 'Interval (ms)',
};

const DEFAULTS: Record<FieldKey, string> = {
  host:     '',
  port:     '502',
  register: '40001',
  count:    '8',
  interval: '1000',
};

export function MonitorScreen({ onBack }: { onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase] = useState<Phase>('form');
  const [rows, setRows] = useState<RegisterResult[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState('');
  const clientRef = useRef<ModbusClient | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clientRef.current?.disconnect();
    };
  }, []);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow && fieldIdx > 0) setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1) setFieldIdx(f => f + 1);
    } else if (phase === 'running' || phase === 'error') {
      if (key.escape) {
        if (timerRef.current) clearInterval(timerRef.current);
        clientRef.current?.disconnect();
        onBack();
      }
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) {
      setFieldIdx(idx + 1);
    } else {
      startMonitor();
    }
  };

  const startMonitor = async () => {
    setPhase('connecting');
    const client = new ModbusClient({ host: values.host, port: parseInt(values.port) });
    clientRef.current = client;

    try {
      await client.connect();
    } catch (err: any) {
      if (isMounted.current) { setError(err.message); setPhase('error'); }
      return;
    }

    const startAddr = parseInt(values.register) - 40001;
    const count = parseInt(values.count);
    const interval = parseInt(values.interval);

    const poll = async () => {
      try {
        const results = await client.readHoldingRegisters(startAddr, count);
        if (isMounted.current) {
          setRows(results);
          setUpdatedAt(new Date().toLocaleTimeString());
          setPhase('running');
        }
      } catch (err: any) {
        if (isMounted.current) { setError(err.message); setPhase('error'); }
      }
    };

    await poll();
    timerRef.current = setInterval(poll, interval);
  };

  return (
    <Box flexDirection="column">
      <Header title="Monitor (live)" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField
              key={f}
              label={LABELS[f]}
              value={values[f]}
              focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)}
              placeholder={DEFAULTS[f] || undefined}
            />
          ))}
          <Box marginTop={1}>
            <Text dimColor>{'↑↓ navigate · Enter next/run · ESC back'}</Text>
          </Box>
        </Box>
      )}

      {phase === 'connecting' && <Text color="yellow">Connecting...</Text>}

      {phase === 'running' && (
        <Box flexDirection="column">
          <Text color="gray">{'Updated: ' + updatedAt + '  '}<Text dimColor>{'interval ' + values.interval + 'ms'}</Text></Text>
          <Text color="gray">{'─'.repeat(46)}</Text>
          {rows.map(r => {
            const bar = '█'.repeat(Math.min(20, Math.floor(r.value / 3277)));
            return (
              <Box key={r.address}>
                <Text color="yellow">{String(r.address).padEnd(8)}</Text>
                <Text color="white">{String(r.value).padStart(6) + '  '}</Text>
                <Text color="cyan">{bar.padEnd(20)}</Text>
              </Box>
            );
          })}
          <Box marginTop={1}><Text dimColor>ESC to stop</Text></Box>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{'✗ ' + error}</Text>
          <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
        </Box>
      )}
    </Box>
  );
}
