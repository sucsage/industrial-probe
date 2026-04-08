import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { createWriteStream, WriteStream } from 'fs';
import { Header } from '../components/Header';
import { FormField } from '../components/FormField';
import { ModbusClient } from '../../protocols/modbus';

type Phase = 'form' | 'running' | 'done' | 'error';

const FIELDS = ['host', 'port', 'register', 'count', 'interval', 'duration', 'output'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  host:     'Host',
  port:     'Port',
  register: 'Register',
  count:    'Count',
  interval: 'Interval (ms)',
  duration: 'Duration (s)',
  output:   'Output file',
};

const DEFAULTS: Record<FieldKey, string> = {
  host:     '',
  port:     '502',
  register: '40001',
  count:    '8',
  interval: '1000',
  duration: '60',
  output:   'log.csv',
};

export function LogScreen({ onBack }: { onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase] = useState<Phase>('form');
  const [rowsWritten, setRowsWritten] = useState(0);
  const [error, setError] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clientRef = useRef<ModbusClient | null>(null);
  const streamRef = useRef<WriteStream | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stop();
    };
  }, []);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    clientRef.current?.disconnect();
    streamRef.current?.end();
  };

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow && fieldIdx > 0) setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1) setFieldIdx(f => f + 1);
    } else if (phase === 'running') {
      if (key.escape) { stop(); onBack(); }
    } else if (phase === 'done' || phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) {
      setFieldIdx(idx + 1);
    } else {
      startLogging();
    }
  };

  const startLogging = async () => {
    setPhase('running');
    setRowsWritten(0);

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
    const duration = parseInt(values.duration) * 1000;
    const outFile = values.output;

    const stream = createWriteStream(outFile);
    streamRef.current = stream;

    const headers = ['timestamp', ...Array.from({ length: count }, (_, i) => `reg_${40001 + startAddr + i}`)];
    stream.write(headers.join(',') + '\n');

    let rows = 0;
    const poll = async () => {
      const ts = new Date().toISOString();
      try {
        const results = await client.readHoldingRegisters(startAddr, count);
        stream.write([ts, ...results.map(r => r.value)].join(',') + '\n');
        rows++;
        if (isMounted.current) setRowsWritten(rows);
      } catch (err: any) {
        if (isMounted.current) { setError(err.message); setPhase('error'); }
        stop();
      }
    };

    await poll();
    timerRef.current = setInterval(poll, interval);

    const finish = () => {
      stop();
      if (isMounted.current) setPhase('done');
    };

    if (duration > 0) stopTimerRef.current = setTimeout(finish, duration);
  };

  return (
    <Box flexDirection="column">
      <Header title="Log to CSV" />

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

      {phase === 'running' && (
        <Box flexDirection="column">
          <Text color="yellow">{'Logging to ' + values.output + '...'}</Text>
          <Text><Text color="green">{String(rowsWritten)}</Text><Text color="gray">{' rows written'}</Text></Text>
          <Box marginTop={1}><Text dimColor>ESC to stop</Text></Box>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Text color="green">{'✓ Saved ' + rowsWritten + ' rows → ' + values.output}</Text>
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
