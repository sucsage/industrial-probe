import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../../components/Header.js';
import { FormField } from '../../components/FormField.js';
import { ModbusRTUClient, RegisterResult } from '../../../protocols/modbus.js';

type Phase = 'form' | 'running' | 'error';

const FIELDS = ['unitId', 'register', 'count', 'interval'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  unitId:   'Unit ID',
  register: 'Register',
  count:    'Count',
  interval: 'Interval (ms)',
};

const DEFAULTS: Record<FieldKey, string> = {
  unitId:   '1',
  register: '40001',
  count:    '8',
  interval: '1000',
};

export function RtuMonitorPanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues]     = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]       = useState<Phase>('form');
  const [rows, setRows]         = useState<RegisterResult[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError]       = useState('');
  const timerRef  = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                    setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1)    setFieldIdx(f => f + 1);
    } else if (phase === 'running' || phase === 'error') {
      if (key.escape) {
        if (timerRef.current) clearInterval(timerRef.current);
        onBack();
      }
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) setFieldIdx(idx + 1);
    else startMonitor();
  };

  const startMonitor = async () => {
    setPhase('running');
    client.setUnitId(parseInt(values.unitId));
    const startAddr = parseInt(values.register) - 40001;
    const count     = parseInt(values.count);
    const interval  = parseInt(values.interval);

    const poll = async () => {
      try {
        const regs = await client.readHoldingRegisters(startAddr, count);
        if (isMounted.current) { setRows(regs); setUpdatedAt(new Date().toLocaleTimeString()); }
      } catch (err: any) {
        if (isMounted.current) { setError(err.message); setPhase('error'); }
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    await poll();
    timerRef.current = setInterval(poll, interval);
  };

  return (
    <Box flexDirection="column">
      <Header title="RTU — Monitor (live)" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField key={f} label={LABELS[f]} value={values[f]} focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)} placeholder={DEFAULTS[f]} />
          ))}
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/run · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'running' && (
        <Box flexDirection="column">
          <Text color="gray">
            {'Updated: ' + updatedAt + '  '}
            <Text dimColor>{'interval ' + values.interval + 'ms · unit ' + values.unitId}</Text>
          </Text>
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
