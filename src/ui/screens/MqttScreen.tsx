import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header.js';
import { FormField } from '../components/FormField.js';
import { MqttClientWrapper, MqttMessage } from '../../protocols/mqtt.js';

type Phase = 'form' | 'connecting' | 'live' | 'error';
type Mode  = 'subscribe' | 'publish';

const FORM_FIELDS = ['host', 'port', 'topic', 'username', 'password'] as const;
type FieldKey = typeof FORM_FIELDS[number];

const LABELS: Record<FieldKey, string> = {
  host:     'Broker host',
  port:     'Port',
  topic:    'Topic',
  username: 'Username',
  password: 'Password',
};

const DEFAULTS: Record<FieldKey, string> = {
  host:     '',
  port:     '1883',
  topic:    '#',
  username: '',
  password: '',
};

const MAX_MESSAGES = 40;

export function MqttScreen({ onBack }: { onBack: () => void }) {
  const [fieldIdx, setFieldIdx]     = useState(0);
  const [values, setValues]         = useState<Record<FieldKey, string>>({ ...DEFAULTS });
  const [phase, setPhase]           = useState<Phase>('form');
  const [mode, setMode]             = useState<Mode>('subscribe');
  const [messages, setMessages]     = useState<MqttMessage[]>([]);
  const [pubTopic, setPubTopic]     = useState('');
  const [pubPayload, setPubPayload] = useState('');
  const [pubFocus, setPubFocus]     = useState<'topic' | 'payload'>('topic');
  const [lastPub, setLastPub]       = useState('');
  const [error, setError]           = useState('');
  const clientRef = useRef<MqttClientWrapper | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clientRef.current?.disconnect();
    };
  }, []);

  useInput((_input, key) => {
    if (phase === 'form') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow   && fieldIdx > 0)                       setFieldIdx(f => f - 1);
      if (key.downArrow && fieldIdx < FORM_FIELDS.length - 1)  setFieldIdx(f => f + 1);
    } else if (phase === 'live') {
      if (key.escape) {
        if (mode === 'publish') { setMode('subscribe'); return; }
        clientRef.current?.disconnect();
        onBack();
      }
      if (_input === 'p' && mode === 'subscribe') {
        setPubTopic(values.topic);
        setPubPayload('');
        setPubFocus('topic');
        setMode('publish');
      }
    } else if (phase === 'error') {
      if (key.escape) onBack();
    }
  });

  const handleSubmit = (idx: number) => () => {
    if (idx < FORM_FIELDS.length - 1) setFieldIdx(idx + 1);
    else connect();
  };

  const connect = async () => {
    setPhase('connecting');
    const client = new MqttClientWrapper();
    clientRef.current = client;

    try {
      await client.connect({
        host:     values.host,
        port:     parseInt(values.port),
        username: values.username || undefined,
        password: values.password || undefined,
      });
    } catch (err: any) {
      if (isMounted.current) { setError(err.message); setPhase('error'); }
      return;
    }

    client.subscribe(values.topic, (msg) => {
      if (isMounted.current) {
        setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
      }
    });

    if (isMounted.current) setPhase('live');
  };

  const handlePublish = async () => {
    if (!pubTopic || !pubPayload) return;
    try {
      await clientRef.current?.publish(pubTopic, pubPayload);
      setLastPub(`✓ Published to ${pubTopic}`);
      setPubPayload('');
    } catch (err: any) {
      setLastPub(`✗ ${err.message}`);
    }
  };

  return (
    <Box flexDirection="column">
      <Header title={'MQTT  ' + (phase === 'live' ? values.host : '')} />

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
              placeholder={DEFAULTS[f] || (f === 'username' ? '(optional)' : undefined)}
            />
          ))}
          <Box marginTop={1}>
            <Text dimColor>{'↑↓ navigate · Enter next/connect · ESC back'}</Text>
          </Box>
        </Box>
      )}

      {phase === 'connecting' && <Text color="yellow">{'Connecting to ' + values.host + ':' + values.port + '...'}</Text>}

      {phase === 'live' && mode === 'subscribe' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="green">{'● Connected  '}</Text>
            <Text color="gray">{'subscribed: '}</Text>
            <Text color="cyan">{values.topic}</Text>
          </Box>

          {messages.length === 0
            ? <Text dimColor>Waiting for messages...</Text>
            : messages.map((m, i) => (
              <Box key={i} flexDirection="column">
                <Box>
                  <Text color="gray">{m.ts + '  '}</Text>
                  <Text color="cyan">{m.topic}</Text>
                </Box>
                <Box paddingLeft={2}>
                  <Text color="white">{m.payload.slice(0, 120)}{m.payload.length > 120 ? '…' : ''}</Text>
                </Box>
              </Box>
            ))
          }

          <Box marginTop={1}>
            <Text dimColor>{'[p] publish · ESC disconnect'}</Text>
          </Box>
        </Box>
      )}

      {phase === 'live' && mode === 'publish' && (
        <Box flexDirection="column" gap={1}>
          <Text color="cyan" bold>Publish</Text>
          <FormField
            label="Topic"
            value={pubTopic}
            focus={pubFocus === 'topic'}
            onChange={setPubTopic}
            onSubmit={() => setPubFocus('payload')}
            placeholder={values.topic}
          />
          <FormField
            label="Payload"
            value={pubPayload}
            focus={pubFocus === 'payload'}
            onChange={setPubPayload}
            onSubmit={handlePublish}
            placeholder="message payload"
          />
          {lastPub && (
            <Text color={lastPub.startsWith('✓') ? 'green' : 'red'}>{lastPub}</Text>
          )}
          <Box marginTop={1}>
            <Text dimColor>{'Enter to send · ESC back to subscribe'}</Text>
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
