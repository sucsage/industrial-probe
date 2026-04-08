import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Dependency check types ────────────────────────────────────────────────────

type Status = 'checking' | 'ok' | 'warn' | 'missing';

interface Check {
  label:   string;
  role:    string;
  status:  Status;
  detail?: string;
  fix?:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function which(cmd: string): Promise<boolean> {
  return new Promise(res => execFile('which', [cmd], err => res(!err)));
}

async function checkSerialportBuilt(): Promise<boolean> {
  try {
    await (new Function('m', 'return import(m)'))('serialport');
    return true;
  } catch {
    return false;
  }
}

function pkgVersion(name: string): string {
  try {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dir, '../../node_modules', name, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return 'v' + pkg.version;
  } catch {
    return '';
  }
}

const STATUS_ICON: Record<Status, string> = {
  checking: '…',
  ok:       '✓',
  warn:     '⚠',
  missing:  '✗',
};

const STATUS_COLOR: Record<Status, string> = {
  checking: 'gray',
  ok:       'green',
  warn:     'yellow',
  missing:  'red',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function StartupScreen({ onDone }: { onDone: () => void }) {
  const [checks, setChecks] = useState<Check[]>([
    { label: 'Node.js',              role: 'runtime',               status: 'checking' },
    { label: 'modbus-serial',        role: 'Modbus TCP/RTU client',  status: 'checking' },
    { label: 'socat',                role: 'RTU simulator',          status: 'checking' },
    { label: 'serialport (native)',  role: 'RTU simulator/client',   status: 'checking' },
    { label: 'mqtt',                 role: 'MQTT subscribe/publish', status: 'checking' },
  ]);
  const [done, setDone]   = useState(false);
  const [auto, setAuto]   = useState<number>(0);

  const update = (label: string, patch: Partial<Check>) =>
    setChecks(prev => prev.map(c => c.label === label ? { ...c, ...patch } : c));

  // ── Run all checks ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {

      // Node.js version
      const nodeVer = process.version;
      const nodeMajor = parseInt(nodeVer.slice(1));
      update('Node.js', {
        status: nodeMajor >= 18 ? 'ok' : 'warn',
        detail: nodeVer,
        fix: nodeMajor < 18 ? 'upgrade to Node.js 18+' : undefined,
      });

      // modbus-serial
      try {
        await import('modbus-serial');
        update('modbus-serial', { status: 'ok', detail: pkgVersion('modbus-serial') });
      } catch {
        update('modbus-serial', { status: 'missing', fix: 'pnpm install' });
      }

      // socat
      const socatOk = await which('socat');
      update('socat', {
        status: socatOk ? 'ok' : 'warn',
        detail: socatOk ? 'found' : 'not found',
        fix:    socatOk ? undefined : 'brew install socat  (optional — RTU sim only)',
      });

      // serialport native bindings
      const spOk = await checkSerialportBuilt();
      update('serialport (native)', {
        status: spOk ? 'ok' : 'warn',
        detail: spOk ? pkgVersion('serialport') : 'bindings not built',
        fix:    spOk ? undefined : 'pnpm approve-builds  (optional — RTU only)',
      });

      // mqtt
      try {
        await import('mqtt');
        update('mqtt', { status: 'ok', detail: pkgVersion('mqtt') });
      } catch {
        update('mqtt', { status: 'missing', fix: 'pnpm install' });
      }

      setDone(true);

      // Auto-advance after 2 s — user can press Enter sooner
      let remaining = 2;
      const t = setInterval(() => {
        remaining--;
        setAuto(remaining);
        if (remaining <= 0) { clearInterval(t); onDone(); }
      }, 1000);
    })();
  }, []);

  useInput((_input, key) => {
    if (done && key.return) onDone();
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasIssues = checks.some(c => c.status === 'missing' || c.status === 'warn');
  const allDone   = checks.every(c => c.status !== 'checking');

  return (
    <Box flexDirection="column" padding={1} gap={1}>

      {/* Banner */}
      <Box flexDirection="column">
        <Text bold color="yellow">{'▓▓▓ industrial-probe'} <Text color="gray">v0.1.0</Text></Text>
        <Text color="gray">{'▓▓▓ TUI for PLC / Modbus / MQTT / Simulator'}</Text>
      </Box>

      {/* Checks */}
      <Box flexDirection="column">
        <Text color="gray" bold>Dependency check</Text>
        <Text color="gray">{'─'.repeat(60)}</Text>

        {checks.map(c => (
          <Box key={c.label}>
            {/* Icon */}
            <Text color={STATUS_COLOR[c.status]}>{STATUS_ICON[c.status] + ' '}</Text>

            {/* Label */}
            <Text color={c.status === 'checking' ? 'gray' : 'white'}>
              {c.label.padEnd(24)}
            </Text>

            {/* Detail */}
            <Text color="gray">{(c.detail ?? '').padEnd(16)}</Text>

            {/* Role */}
            <Text dimColor>{c.role}</Text>
          </Box>
        ))}
      </Box>

      {/* Fix hints */}
      {allDone && hasIssues && (
        <Box flexDirection="column">
          <Text color="gray">{'─'.repeat(60)}</Text>
          {checks
            .filter(c => c.fix)
            .map(c => (
              <Box key={c.label}>
                <Text color="yellow">{'  ' + c.label + ':  '}</Text>
                <Text color="white">{c.fix}</Text>
              </Box>
            ))}
        </Box>
      )}

      {/* Footer */}
      {allDone && (
        <Box>
          <Text dimColor>
            {hasIssues
              ? 'Optional deps missing — TCP features work without them.  '
              : 'All dependencies OK.  '}
          </Text>
          <Text color="gray">
            {done ? `Enter to continue (auto in ${auto}s)` : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}
