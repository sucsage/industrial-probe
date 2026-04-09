import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header.js';
import { FormField } from '../components/FormField.js';
import { ModbusClient } from '../../protocols/modbus.js';

type Phase = 'form' | 'running' | 'done';

const FIELDS = ['subnet', 'port', 'timeout'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  subnet:  'Subnet',
  port:    'Port',
  timeout: 'Timeout (ms)',
};

const DEFAULTS: Record<FieldKey, string> = {
  subnet:  '192.168.1.0/24',
  port:    '502',
  timeout: '1000',
};

export function ScanScreen({ onBack }: { onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase] = useState<Phase>('form');
  const [found, setFound] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow && fieldIdx > 0) setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1) setFieldIdx(f => f + 1);
    } else if (phase === 'done') {
      if (key.escape) { onBack(); return; }
    } else if (phase === 'running') {
      if (key.escape) { cancelled.current = true; onBack(); }
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) {
      setFieldIdx(idx + 1);
    } else {
      runScan();
    }
  };

  const runScan = async () => {
    cancelled.current = false;
    setFound([]);
    setProgress(0);
    setPhase('running');

    const base = values.subnet.replace(/\/\d+$/, '').replace(/\.\d+$/, '');
    const port = parseInt(values.port);
    const timeout = parseInt(values.timeout);

    const tasks: Promise<void>[] = [];
    for (let i = 1; i <= 254; i++) {
      const host = `${base}.${i}`;
      tasks.push((async () => {
        if (cancelled.current) return;
        const client = new ModbusClient({ host, port, timeout });
        try {
          await client.connect();
          const alive = await client.ping();
          if (alive && !cancelled.current) setFound(prev => [...prev, host]);
          client.disconnect();
        } catch { /* not found */ }
        if (!cancelled.current) setProgress(prev => prev + 1);
      })());
    }

    await Promise.all(tasks);
    if (!cancelled.current) setPhase('done');
  };

  return (
    <Box flexDirection="column">
      <Header title="Scan Subnet" />

      {phase === 'form' && (
        <Box flexDirection="column" gap={0}>
          {FIELDS.map((f, i) => (
            <FormField
              key={f}
              label={LABELS[f]}
              value={values[f]}
              focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)}
              placeholder={DEFAULTS[f]}
            />
          ))}
          <Box marginTop={1}>
            <Text dimColor>{'↑↓ navigate · Enter next/run · ESC back'}</Text>
          </Box>
        </Box>
      )}

      {phase === 'running' && (
        <Box flexDirection="column" gap={0}>
          <Text color="yellow">{'Scanning ' + values.subnet + '...'}</Text>
          <Text color="gray">{'Progress: ' + progress + '/254'}</Text>
          {found.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {found.map(h => (
                <Text key={h}><Text color="green">{'● '}</Text><Text color="white">{h}</Text></Text>
              ))}
            </Box>
          )}
          <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column" gap={0}>
          {found.length === 0
            ? <Text color="red">{'No Modbus devices found on ' + values.subnet}</Text>
            : (
              <>
                <Text color="green">{'Found ' + found.length + ' device(s):'}</Text>
                <Box flexDirection="column" marginTop={1}>
                  {found.map(h => (
                    <Text key={h}><Text color="green">{'● '}</Text><Text color="white">{h}</Text></Text>
                  ))}
                </Box>
              </>
            )
          }
          <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
        </Box>
      )}
    </Box>
  );
}
