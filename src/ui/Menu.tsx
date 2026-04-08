import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

type ScreenName = 'scan' | 'read' | 'write' | 'monitor' | 'test' | 'log' | 'rtu' | 'regmap' | 'mqtt' | 'sim';

const items = [
  { label: '── Modbus TCP ──────────────────────────────', value: '__sep1__' },
  { label: 'Scan subnet           — find devices on network',     value: 'scan' },
  { label: 'Read registers        — read holding registers',      value: 'read' },
  { label: 'Write register        — write a value to a register', value: 'write' },
  { label: 'Monitor (live)        — poll registers in real-time', value: 'monitor' },
  { label: 'Register map          — scan & discover register map', value: 'regmap' },
  { label: '── Modbus RTU (Serial) ─────────────────────', value: '__sep2__' },
  { label: 'RTU Read / Monitor    — RS-485 serial connection',    value: 'rtu' },
  { label: '── MQTT ────────────────────────────────────', value: '__sep3__' },
  { label: 'MQTT Subscribe/Publish — connect to broker',          value: 'mqtt' },
  { label: '── Tools ───────────────────────────────────', value: '__sep4__' },
  { label: 'Run test suite        — run YAML test file',          value: 'test' },
  { label: 'Log to CSV            — log register values to file', value: 'log' },
  { label: '── Simulator ───────────────────────────────', value: '__sep5__' },
  { label: 'Launch simulator      — virtual Modbus device server', value: 'sim' },
];

export function Menu({ onSelect }: { onSelect: (screen: ScreenName) => void }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold color="yellow">{'▓▓▓ industrial-probe'} <Text color="gray">v0.1.0</Text></Text>
        <Text color="gray">{'▓▓▓ Zero-install TUI for PLC / Modbus / MQTT testing'}</Text>
      </Box>

      <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1} paddingY={0}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value.startsWith('__sep')) return;
            onSelect(item.value as ScreenName);
          }}
        />
      </Box>

      <Text dimColor>{'↑↓ navigate · Enter select · Ctrl+C exit'}</Text>
    </Box>
  );
}
