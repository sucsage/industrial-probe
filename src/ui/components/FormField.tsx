import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  focus: boolean;
  placeholder?: string;
}

export function FormField({ label, value, onChange, onSubmit, focus, placeholder }: FormFieldProps) {
  return (
    <Box>
      <Text color={focus ? 'cyan' : 'gray'}>{label.padEnd(14)}</Text>
      <Text color="gray">{'│ '}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={focus}
        placeholder={placeholder ?? ''}
      />
    </Box>
  );
}
