import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../../components/Header.js';
import { FormField } from '../../components/FormField.js';
import { ModbusRTUClient } from '../../../protocols/modbus.js';

type Phase = 'form' | 'scanning' | 'done';

const FIELDS = ['start', 'end'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = { start: 'Unit ID from', end: 'Unit ID to' };
const DEFAULTS: Record<FieldKey, string> = { start: '1', end: '247' };

export function RtuScanPanel({
  client,
  defaultUnitId,
  onBack,
}: {
  client: ModbusRTUClient;
  defaultUnitId: number;
  onBack: () => void;
}) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues]     = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]       = useState<Phase>('form');
  const [found, setFound]       = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0) setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1) setFieldIdx(f => f + 1);
    } else if (phase === 'scanning') {
      if (key.escape) { cancelled.current = true; onBack(); }
    } else if (phase === 'done') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) setFieldIdx(idx + 1);
    else runScan();
  };

  const runScan = async () => {
    cancelled.current = false;
    setFound([]);
    setProgress(0);
    setPhase('scanning');

    const start = Math.max(1, parseInt(values.start));
    const end   = Math.min(247, parseInt(values.end));
    const hits: number[] = [];

    for (let id = start; id <= end; id++) {
      if (cancelled.current) break;
      client.setUnitId(id);
      try {
        await client.readHoldingRegisters(0, 1);
        hits.push(id);
        setFound([...hits]);
      } catch { /* no response */ }
      setProgress(id - start + 1);
    }

    // restore original unit ID
    client.setUnitId(defaultUnitId);
    if (!cancelled.current) setPhase('done');
  };

  const total = Math.max(1, parseInt(values.end) - parseInt(values.start) + 1);

  return (
    <Box flexDirection="column">
      <Header title="RTU — Scan Unit IDs" />

      {phase === 'form' && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>Probes each unit ID by reading register 0</Text>
          <Box marginTop={1} flexDirection="column">
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
          </Box>
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/scan · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'scanning' && (
        <Box flexDirection="column" gap={0}>
          <Box>
            <Text color="yellow">Scanning unit IDs... </Text>
            <Text color="white">{progress}/{total}</Text>
            <Text color="cyan">{'  ' + '█'.repeat(Math.floor((progress / total) * 24)).padEnd(24, '░')}</Text>
          </Box>
          {found.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {found.map(id => (
                <Text key={id}><Text color="green">● </Text><Text color="white">Unit ID {id}</Text></Text>
              ))}
            </Box>
          )}
          <Box marginTop={1}><Text dimColor>ESC to cancel</Text></Box>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column">
          {found.length === 0
            ? <Text color="red">No devices found on bus</Text>
            : (
              <>
                <Text color="green">{found.length + ' device(s) found:'}</Text>
                <Box flexDirection="column" marginTop={1}>
                  {found.map(id => (
                    <Text key={id}><Text color="green">● </Text><Text color="white">Unit ID {id}</Text></Text>
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
