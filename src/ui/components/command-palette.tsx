import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Command } from '../../types/index.js';

interface CommandPaletteProps {
  commands: Command[];
  visible: boolean;
  onExecute: (id: string) => void;
  onClose: () => void;
}

/**
 * Fuzzy-match command palette overlay.
 * Triggered by Ctrl+Shift+P (or customizable).
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  visible,
  onExecute,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!visible) return null;

  const filtered = query
    ? commands.filter(
        (c) =>
          c.id.toLowerCase().includes(query.toLowerCase()) ||
          c.label.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      width={60}
      paddingX={1}
    >
      <Box>
        <Text color="blue">❯ </Text>
        <TextInput value={query} onChange={setQuery} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {filtered.slice(0, 10).map((cmd, i) => (
          <Box key={cmd.id}>
            <Text inverse={i === selectedIdx}>
              {i === selectedIdx ? '❯ ' : '  '}
              {cmd.label}
              {cmd.keybinding && (
                <Text dimColor>  ({cmd.keybinding})</Text>
              )}
            </Text>
          </Box>
        ))}
        {filtered.length === 0 && (
          <Text dimColor>  No matching commands</Text>
        )}
      </Box>
    </Box>
  );
};
