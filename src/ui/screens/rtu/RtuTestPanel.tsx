import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { Header } from '../../components/Header';
import { FormField } from '../../components/FormField';
import { ModbusRTUClient } from '../../../protocols/modbus';

type Phase = 'form' | 'running' | 'done' | 'error';

interface TestCase { name: string; register: number; expect: string; unitId?: number; }
interface TestConfig { name: string; tests: TestCase[]; unitId?: number; }

interface TestRow {
  name: string; passed: boolean; value: number | string; expect: string; isError?: boolean;
}

function evalExpect(value: number, expr: string): boolean {
  const m = expr.match(/^(\w+)\(([^)]+)\)$/);
  if (!m) return false;
  const [, fn, args] = m;
  const nums = args.split(',').map(Number);
  switch (fn) {
    case 'equals':      return value === nums[0];
    case 'lessThan':    return value < nums[0];
    case 'greaterThan': return value > nums[0];
    case 'between':     return value >= nums[0] && value <= nums[1];
    default:            return false;
  }
}

export function RtuTestPanel({ client, onBack }: { client: ModbusRTUClient; onBack: () => void }) {
  const [filePath, setFilePath] = useState('');
  const [phase, setPhase]       = useState<Phase>('form');
  const [testRows, setTestRows] = useState<TestRow[]>([]);
  const [summary, setSummary]   = useState({ passed: 0, failed: 0, name: '' });
  const [error, setError]       = useState('');

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) onBack();
    } else if (phase === 'done' || phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const runTests = async () => {
    let config: TestConfig;
    try {
      config = parse(readFileSync(filePath.trim(), 'utf-8')) as TestConfig;
    } catch (err: any) {
      setError('Cannot read config: ' + err.message);
      setPhase('error');
      return;
    }

    setPhase('running');
    if (config.unitId) client.setUnitId(config.unitId);

    const rows: TestRow[] = [];
    let passed = 0, failed = 0;

    for (const t of config.tests) {
      if (t.unitId) client.setUnitId(t.unitId);
      try {
        const [result] = await client.readHoldingRegisters(t.register - 40001, 1);
        const ok = evalExpect(result.value, t.expect);
        rows.push({ name: t.name, passed: ok, value: result.value, expect: t.expect });
        if (ok) passed++; else failed++;
      } catch (err: any) {
        rows.push({ name: t.name, passed: false, value: '—', expect: t.expect, isError: true });
        failed++;
      }
      setTestRows([...rows]);
    }

    setSummary({ passed, failed, name: config.name });
    setPhase('done');
  };

  return (
    <Box flexDirection="column">
      <Header title="RTU — Test Suite" />

      {phase === 'form' && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>YAML format: name, tests[]. Per-test unitId override supported.</Text>
          <Box marginTop={1}>
            <FormField label="YAML file" value={filePath} focus={true}
              onChange={setFilePath} onSubmit={runTests} placeholder="./factory-test.yaml" />
          </Box>
          <Box marginTop={1}><Text dimColor>Enter to run · ESC back</Text></Box>
        </Box>
      )}

      {(phase === 'running' || phase === 'done') && (
        <Box flexDirection="column">
          {testRows.map((r, i) => (
            <Box key={i}>
              <Text color={r.passed ? 'green' : 'red'}>{(r.passed ? 'PASS ✓' : 'FAIL ✗') + '  '}</Text>
              <Text color="white">{r.name.padEnd(30)}</Text>
              <Text color="gray">→ </Text>
              <Text color={r.passed ? 'green' : 'red'}>{String(r.value)}</Text>
              {!r.passed && <Text color="gray">{'  (expected: ' + r.expect + ')'}</Text>}
            </Box>
          ))}
          {phase === 'running' && <Text color="yellow">Running...</Text>}
          {phase === 'done' && (
            <>
              <Text color="gray">{'─'.repeat(46)}</Text>
              <Box>
                <Text color="green">{summary.passed + ' passed  '}</Text>
                <Text color={summary.failed > 0 ? 'red' : 'gray'}>{summary.failed + ' failed'}</Text>
              </Box>
              <Box marginTop={1}><Text dimColor>ESC to go back</Text></Box>
            </>
          )}
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
