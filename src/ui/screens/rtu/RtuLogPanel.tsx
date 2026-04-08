import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { createWriteStream, WriteStream } from 'fs';
import { Header } from '../../components/Header';
import { FormField } from '../../components/FormField';
import { ModbusRTUClient } from '../../../protocols/modbus';

type Phase = 'form' | 'running' | 'done' | 'error';

const FIELDS = ['unitId', 'register', 'count', 'interval', 'duration', 'output'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  unitId:   'Unit ID',
  register: 'Register',
  count:    'Count',
  interval: 'Interval (ms)',
  duration: 'Duration (s)',
  output:   'Output file',
};

const DEFAULTS: Record<FieldKey, string> = {
  unitId:   '1',
  register: '40001',
  count:    '8',
  interval: '1000',
  duration: '60',
  output:   'log.csv',
};

export function RtuLogPanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues]     = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]       = useState<Phase>('form');
  const [rows, setRows]         = useState(0);
  const [error, setError]       = useState('');
  const timerRef    = useRef<NodeJS.Timeout | null>(null);
  const stopRef     = useRef<NodeJS.Timeout | null>(null);
  const streamRef   = useRef<WriteStream | null>(null);
  const isMounted   = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; stop(); };
  }, []);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopRef.current)  clearTimeout(stopRef.current);
    streamRef.current?.end();
  };

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                    setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1)    setFieldIdx(f => f + 1);
    } else if (phase === 'running') {
      if (key.escape) { stop(); onBack(); }
    } else if (phase === 'done' || phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) setFieldIdx(idx + 1);
    else startLogging();
  };

  const startLogging = async () => {
    setPhase('running');
    setRows(0);
    client.setUnitId(parseInt(values.unitId));

    const startAddr = parseInt(values.register) - 40001;
    const count     = parseInt(values.count);
    const interval  = parseInt(values.interval);
    const duration  = parseInt(values.duration) * 1000;
    const stream    = createWriteStream(values.output);
    streamRef.current = stream;

    const headers = ['timestamp', ...Array.from({ length: count }, (_, i) => `reg_${40001 + startAddr + i}`)];
    stream.write(headers.join(',') + '\n');

    let n = 0;
    const poll = async () => {
      const ts = new Date().toISOString();
      try {
        const regs = await client.readHoldingRegisters(startAddr, count);
        stream.write([ts, ...regs.map(r => r.value)].join(',') + '\n');
        n++;
        if (isMounted.current) setRows(n);
      } catch (err: any) {
        if (isMounted.current) { setError(err.message); setPhase('error'); }
        stop();
      }
    };

    await poll();
    timerRef.current = setInterval(poll, interval);

    const finish = () => { stop(); if (isMounted.current) setPhase('done'); };
    if (duration > 0) stopRef.current = setTimeout(finish, duration);
  };

  return (
    <Box flexDirection="column">
      <Header title="RTU — Log to CSV" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField key={f} label={LABELS[f]} value={values[f]} focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)} placeholder={DEFAULTS[f]} />
          ))}
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/start · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'running' && (
        <Box flexDirection="column">
          <Text color="yellow">{'Logging to ' + values.output + '...'}</Text>
          <Text><Text color="green">{String(rows)}</Text><Text color="gray"> rows written</Text></Text>
          <Box marginTop={1}><Text dimColor>ESC to stop</Text></Box>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Text color="green">{'✓ Saved ' + rows + ' rows → ' + values.output}</Text>
          <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
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
