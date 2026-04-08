import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { FormField } from '../components/FormField';
import { ModbusClient } from '../../protocols/modbus';

type Phase = 'form' | 'scanning' | 'map' | 'watching' | 'error';

const FORM_FIELDS = ['host', 'port', 'start', 'end', 'blockSize'] as const;
type FieldKey = typeof FORM_FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  host:      'Host',
  port:      'Port',
  start:     'Start register',
  end:       'End register',
  blockSize: 'Block size',
};

const DEFAULTS: Record<FieldKey, string> = {
  host:      '',
  port:      '502',
  start:     '40001',
  end:       '40100',
  blockSize: '10',
};

export interface RegEntry {
  address: number;   // 40001-based display address
  rawAddr: number;   // 0-based modbus address
  value: number;
  readable: boolean;
  changed: boolean;
  prevValue: number;
}

export function RegisterMapScreen({ onBack }: { onBack: () => void }) {
  const [fieldIdx, setFieldIdx]     = useState(0);
  const [values, setValues]         = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]           = useState<Phase>('form');
  const [entries, setEntries]       = useState<RegEntry[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal]   = useState(0);
  const [error, setError]           = useState('');
  const clientRef   = useRef<ModbusClient | null>(null);
  const timerRef    = useRef<NodeJS.Timeout | null>(null);
  const isMounted   = useRef(true);
  const entriesRef  = useRef<RegEntry[]>([]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clientRef.current?.disconnect();
    };
  }, []);

  useInput((input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                       setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FORM_FIELDS.length - 1)  setFieldIdx(f => f + 1);
    } else if (phase === 'map') {
      if (key.escape) onBack();
      if (input === 'w') startWatch();
    } else if (phase === 'watching') {
      if (key.escape) {
        if (timerRef.current) clearInterval(timerRef.current);
        clientRef.current?.disconnect();
        onBack();
      }
    } else if (phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FORM_FIELDS.length - 1) setFieldIdx(idx + 1);
    else runScan();
  };

  const runScan = async () => {
    setEntries([]);
    setScanProgress(0);
    setPhase('scanning');

    const client = new ModbusClient({ host: values.host, port: parseInt(values.port) });
    clientRef.current = client;

    try {
      await client.connect();
    } catch (err: any) {
      if (isMounted.current) { setError(err.message); setPhase('error'); }
      return;
    }

    const startDisp = parseInt(values.start);
    const endDisp   = parseInt(values.end);
    const block     = Math.max(1, parseInt(values.blockSize));
    const startRaw  = startDisp - 40001;
    const endRaw    = endDisp   - 40001;
    const total     = endRaw - startRaw + 1;
    setScanTotal(total);

    const found: RegEntry[] = [];

    // Try each block; fall back to individual on failure
    for (let raw = startRaw; raw <= endRaw; raw += block) {
      if (!isMounted.current) break;
      const size = Math.min(block, endRaw - raw + 1);

      try {
        const regs = await client.readHoldingRegisters(raw, size);
        for (const r of regs) {
          found.push({ address: r.address, rawAddr: raw + (r.address - (40001 + raw)), value: r.value, readable: true, changed: false, prevValue: r.value });
        }
      } catch {
        // fallback: try one by one
        for (let i = raw; i < raw + size; i++) {
          if (!isMounted.current) break;
          try {
            const [r] = await client.readHoldingRegisters(i, 1);
            found.push({ address: r.address, rawAddr: i, value: r.value, readable: true, changed: false, prevValue: r.value });
          } catch {
            found.push({ address: 40001 + i, rawAddr: i, value: 0, readable: false, changed: false, prevValue: 0 });
          }
        }
      }

      if (isMounted.current) {
        const progress = Math.min(raw + size - startRaw, total);
        setScanProgress(progress);
        setEntries([...found]);
      }
    }

    entriesRef.current = found;
    if (isMounted.current) setPhase('map');
  };

  const startWatch = () => {
    const client = clientRef.current;
    if (!client) return;
    setPhase('watching');

    timerRef.current = setInterval(async () => {
      const current = entriesRef.current.filter(e => e.readable);
      if (!current.length) return;

      const updated = [...entriesRef.current];
      for (const entry of current) {
        try {
          const [r] = await client.readHoldingRegisters(entry.rawAddr, 1);
          const idx  = updated.findIndex(e => e.rawAddr === entry.rawAddr);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              changed:   r.value !== updated[idx].value,
              prevValue: updated[idx].value,
              value:     r.value,
            };
          }
        } catch { /* keep last value */ }
      }

      entriesRef.current = updated;
      if (isMounted.current) setEntries([...updated]);
    }, 1000);
  };

  const readable = entries.filter(e => e.readable);
  const total    = scanTotal || 1;

  return (
    <Box flexDirection="column">
      <Header title="Register Map" />

      {phase === 'form' && (
        <Box flexDirection="column">
          {FORM_FIELDS.map((f, i) => (
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

      {phase === 'scanning' && (
        <Box flexDirection="column" gap={0}>
          <Box>
            <Text color="yellow">{'Scanning... '}</Text>
            <Text color="white">{scanProgress}</Text>
            <Text color="gray">{'/' + scanTotal + '  '}</Text>
            <Text color="cyan">{('█').repeat(Math.floor((scanProgress / total) * 30)).padEnd(30, '░')}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            {entries.filter(e => e.readable).slice(-8).map(e => (
              <Box key={e.address}>
                <Text color="green">{'  ● '}</Text>
                <Text color="yellow">{String(e.address).padEnd(8)}</Text>
                <Text color="white">{String(e.value)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {(phase === 'map' || phase === 'watching') && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={phase === 'watching' ? 'cyan' : 'green'}>
              {phase === 'watching' ? '⟳ Watching  ' : '✓ Done  '}
            </Text>
            <Text color="white">{readable.length}</Text>
            <Text color="gray">{' readable / '}</Text>
            <Text color="gray">{scanTotal + ' scanned'}</Text>
          </Box>

          {/* header */}
          <Box>
            <Text color="gray" bold>{'Address'.padEnd(10)}</Text>
            <Text color="gray" bold>{'Dec'.padEnd(8)}</Text>
            <Text color="gray" bold>{'Hex'.padEnd(8)}</Text>
            <Text color="gray" bold>{'Bar'}</Text>
          </Box>
          <Text color="gray">{'─'.repeat(50)}</Text>

          {entries.map(e => {
            if (!e.readable) {
              return (
                <Box key={e.address}>
                  <Text color="gray">{String(e.address).padEnd(10)}</Text>
                  <Text dimColor>{'—'}</Text>
                </Box>
              );
            }
            const bar = '█'.repeat(Math.min(16, Math.floor(e.value / 4096)));
            const valueColor = e.changed ? 'cyan' : 'white';
            return (
              <Box key={e.address}>
                <Text color={e.changed ? 'cyan' : 'yellow'}>{String(e.address).padEnd(10)}</Text>
                <Text color={valueColor}>{String(e.value).padEnd(8)}</Text>
                <Text color="gray">{'0x' + e.value.toString(16).toUpperCase().padStart(4, '0') + '  '}</Text>
                <Text color={e.changed ? 'cyan' : 'gray'}>{bar}</Text>
              </Box>
            );
          })}

          <Box marginTop={1}>
            {phase === 'map'      && <Text dimColor>{'[w] watch mode · ESC back'}</Text>}
            {phase === 'watching' && <Text dimColor>{'Changed values highlighted in cyan · ESC stop'}</Text>}
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
