import React from 'react';
import { Box, Text } from 'ink';

export function Header({ title }: { title: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="yellow">{'⚡ ' + title}</Text>
      <Text color="gray">{'─'.repeat(50)}</Text>
    </Box>
  );
}
