import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../../components/Header';
import { FormField } from '../../components/FormField';
import { ModbusRTUClient, RegisterResult } from '../../../protocols/modbus';

type Phase = 'form' | 'running' | 'done' | 'error';

const FIELDS = ['unitId', 'register', 'count'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  unitId:   'Unit ID',
  register: 'Register',
  count:    'Count',
};

const DEFAULTS: Record<FieldKey, string> = {
  unitId:   '1',
  register: '40001',
  count:    '10',
};

export function RtuReadPanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues]     = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]       = useState<Phase>('form');
  const [results, setResults]   = useState<RegisterResult[]>([]);
  const [error, setError]       = useState('');

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                    setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1)    setFieldIdx(f => f + 1);
    } else if (phase === 'done' || phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) setFieldIdx(idx + 1);
    else runRead();
  };

  const runRead = async () => {
    setPhase('running');
    client.setUnitId(parseInt(values.unitId));
    try {
      const regs = await client.readHoldingRegisters(parseInt(values.register) - 40001, parseInt(values.count));
      setResults(regs);
      setPhase('done');
    } catch (err: any) {
      setError(err.message);
      setPhase('error');
    }
  };

  return (
    <Box flexDirection="column">
      <Header title="RTU — Read Registers" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField key={f} label={LABELS[f]} value={values[f]} focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)} placeholder={DEFAULTS[f]} />
          ))}
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/read · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'running' && <Text color="yellow">Reading...</Text>}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Box>
            <Text color="gray" bold>{'Address'.padEnd(10)}</Text>
            <Text color="gray" bold>{'Dec'.padEnd(8)}</Text>
            <Text color="gray" bold>{'Hex'.padEnd(8)}</Text>
            <Text color="gray" bold>Bin</Text>
          </Box>
          <Text color="gray">{'─'.repeat(46)}</Text>
          {results.map(r => (
            <Box key={r.address}>
              <Text color="yellow">{'4' + String(r.address - 40001 + 1).padStart(4, '0') + '  '}</Text>
              <Text color="white">{String(r.value).padEnd(8)}</Text>
              <Text color="cyan">{'0x' + r.value.toString(16).toUpperCase().padStart(4, '0') + '  '}</Text>
              <Text color="gray">{r.value.toString(2).padStart(16, '0')}</Text>
            </Box>
          ))}
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
