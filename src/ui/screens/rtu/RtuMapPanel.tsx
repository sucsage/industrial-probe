import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../../components/Header.js';
import { FormField } from '../../components/FormField.js';
import { ModbusRTUClient } from '../../../protocols/modbus.js';

type Phase = 'form' | 'scanning' | 'map' | 'watching' | 'error';

const FIELDS = ['unitId', 'start', 'end', 'blockSize'] as const;
type FieldKey = typeof FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  unitId:    'Unit ID',
  start:     'Start register',
  end:       'End register',
  blockSize: 'Block size',
};

const DEFAULTS: Record<FieldKey, string> = {
  unitId:    '1',
  start:     '40001',
  end:       '40100',
  blockSize: '10',
};

interface RegEntry {
  address: number;
  rawAddr: number;
  value:   number;
  readable: boolean;
  changed:  boolean;
}

export function RtuMapPanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [fieldIdx, setFieldIdx]     = useState(0);
  const [values, setValues]         = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]           = useState<Phase>('form');
  const [entries, setEntries]       = useState<RegEntry[]>([]);
  const [progress, setProgress]     = useState(0);
  const [total, setTotal]           = useState(1);
  const [error, setError]           = useState('');
  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const entriesRef = useRef<RegEntry[]>([]);
  const isMounted  = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useInput((input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                    setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FIELDS.length - 1)    setFieldIdx(f => f + 1);
    } else if (phase === 'map') {
      if (key.escape) onBack();
      if (input === 'w') startWatch();
    } else if (phase === 'watching') {
      if (key.escape) { if (timerRef.current) clearInterval(timerRef.current); onBack(); }
    } else if (phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FIELDS.length - 1) setFieldIdx(idx + 1);
    else runScan();
  };

  const runScan = async () => {
    setEntries([]);
    setProgress(0);
    setPhase('scanning');

    client.setUnitId(parseInt(values.unitId));
    const startRaw = parseInt(values.start) - 40001;
    const endRaw   = parseInt(values.end)   - 40001;
    const block    = Math.max(1, parseInt(values.blockSize));
    const tot      = endRaw - startRaw + 1;
    setTotal(tot);

    const found: RegEntry[] = [];

    for (let raw = startRaw; raw <= endRaw; raw += block) {
      if (!isMounted.current) break;
      const size = Math.min(block, endRaw - raw + 1);
      try {
        const regs = await client.readHoldingRegisters(raw, size);
        for (const r of regs) {
          found.push({ address: r.address, rawAddr: raw + (r.address - (40001 + raw)), value: r.value, readable: true, changed: false });
        }
      } catch {
        for (let i = raw; i < raw + size; i++) {
          try {
            const [r] = await client.readHoldingRegisters(i, 1);
            found.push({ address: r.address, rawAddr: i, value: r.value, readable: true, changed: false });
          } catch {
            found.push({ address: 40001 + i, rawAddr: i, value: 0, readable: false, changed: false });
          }
        }
      }
      if (isMounted.current) { setProgress(Math.min(raw + size - startRaw, tot)); setEntries([...found]); }
    }

    entriesRef.current = found;
    if (isMounted.current) setPhase('map');
  };

  const startWatch = () => {
    setPhase('watching');
    timerRef.current = setInterval(async () => {
      const updated = [...entriesRef.current];
      for (const e of updated.filter(x => x.readable)) {
        try {
          const [r] = await client.readHoldingRegisters(e.rawAddr, 1);
          const idx = updated.findIndex(x => x.rawAddr === e.rawAddr);
          if (idx !== -1) updated[idx] = { ...updated[idx], changed: r.value !== updated[idx].value, value: r.value };
        } catch { /* keep last */ }
      }
      entriesRef.current = updated;
      if (isMounted.current) setEntries([...updated]);
    }, 1000);
  };

  const readable = entries.filter(e => e.readable).length;

  return (
    <Box flexDirection="column">
      <Header title="RTU — Register Map" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FIELDS.map((f, i) => (
            <FormField key={f} label={LABELS[f]} value={values[f]} focus={fieldIdx === i}
              onChange={v => setValues(prev => ({ ...prev, [f]: v }))}
              onSubmit={handleSubmit(i)} placeholder={DEFAULTS[f]} />
          ))}
          <Box marginTop={1}><Text dimColor>↑↓ navigate · Enter next/scan · ESC back</Text></Box>
        </Box>
      )}

      {phase === 'scanning' && (
        <Box flexDirection="column">
          <Box>
            <Text color="yellow">Scanning... </Text>
            <Text color="white">{progress}/{total}</Text>
            <Text color="cyan">{'  ' + '█'.repeat(Math.floor((progress / total) * 28)).padEnd(28, '░')}</Text>
          </Box>
          {entries.filter(e => e.readable).slice(-6).map(e => (
            <Box key={e.address}>
              <Text color="green">  ● </Text>
              <Text color="yellow">{String(e.address).padEnd(8)}</Text>
              <Text color="white">{String(e.value)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {(phase === 'map' || phase === 'watching') && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={phase === 'watching' ? 'cyan' : 'green'}>{phase === 'watching' ? '⟳ Watching  ' : '✓ Done  '}</Text>
            <Text color="white">{readable}</Text>
            <Text color="gray">{' readable / ' + total + ' scanned'}</Text>
          </Box>
          <Box>
            <Text color="gray" bold>{'Address'.padEnd(10)}</Text>
            <Text color="gray" bold>{'Dec'.padEnd(8)}</Text>
            <Text color="gray" bold>{'Hex'.padEnd(8)}</Text>
            <Text color="gray" bold>Bar</Text>
          </Box>
          <Text color="gray">{'─'.repeat(50)}</Text>
          {entries.map(e => e.readable
            ? (
              <Box key={e.address}>
                <Text color={e.changed ? 'cyan' : 'yellow'}>{String(e.address).padEnd(10)}</Text>
                <Text color={e.changed ? 'cyan' : 'white'}>{String(e.value).padEnd(8)}</Text>
                <Text color="gray">{'0x' + e.value.toString(16).toUpperCase().padStart(4, '0') + '  '}</Text>
                <Text color={e.changed ? 'cyan' : 'gray'}>{'█'.repeat(Math.min(16, Math.floor(e.value / 4096)))}</Text>
              </Box>
            )
            : (
              <Box key={e.address}>
                <Text color="gray">{String(e.address).padEnd(10)}</Text>
                <Text dimColor>—</Text>
              </Box>
            )
          )}
          <Box marginTop={1}>
            {phase === 'map'      && <Text dimColor>[w] watch mode · ESC back</Text>}
            {phase === 'watching' && <Text dimColor>Changed = cyan · ESC stop</Text>}
          </Box>
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
