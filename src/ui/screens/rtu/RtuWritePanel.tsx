import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../../components/Header';
import { FormField } from '../../components/FormField';
import { ModbusRTUClient } from '../../../protocols/modbus';

type Phase = 'form' | 'running' | 'done' | 'error';

const FIELDS = ['unitId', 'register', 'value'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  unitId:   'Unit ID',
  register: 'Register',
  value:    'Value (0–65535)',
};

const DEFAULTS: Record<FieldKey, string> = {
  unitId:   '1',
  register: '40001',
  value:    '0',
};

export function RtuWritePanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues]     = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]       = useState<Phase>('form');
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
    else runWrite();
  };

  const runWrite = async () => {
    const val = parseInt(values.value);
    if (isNaN(val) || val < 0 || val > 65535) {
      setError('Value must be 0–65535');
      setPhase('error');
      return;
    }
    setPhase('running');
    client.setUnitId(parseInt(values.unitId));
    try {
      await client.writeRegister(parseInt(values.register) - 40001, val);
      setPhase('done');
    } catch (err: any) {
      setError(err.message);
      setPhase('error');
    }
  };

  return (
    <Box flexDirection="column">
      <Header title="RTU — Write Register" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField key={f} label={LABELS[f]} value={values[f]} focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)} placeholder={DEFAULTS[f]} />
          ))}
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/write · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'running' && <Text color="yellow">Writing...</Text>}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Text color="green">
            {'✓ Wrote '}<Text color="white">{values.value}</Text>
            {' → register '}<Text color="yellow">{values.register}</Text>
            {' (unit '}<Text color="gray">{values.unitId}</Text>{')'}
          </Text>
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
