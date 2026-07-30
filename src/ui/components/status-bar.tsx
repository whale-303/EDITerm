import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  fileName?: string;
  cursorLine?: number;
  cursorCol?: number;
  mode?: string;
  cols: number;
  focusTarget?: string;
}

/** Bottom status bar, VSCode-style: file+mode left, focus+position right. Fills full width. */
export const StatusBar: React.FC<StatusBarProps> = ({
  fileName = 'untitled',
  cursorLine = 1,
  cursorCol = 1,
  mode = 'NORMAL',
  cols,
  focusTarget = 'sidebar',
}) => {
  const focusLabel = `[● ${focusTarget}]`;
  const left = `${fileName} [${mode}]`;
  const right = `${focusLabel}  Ln ${cursorLine}, Col ${cursorCol}`;
  const pad = Math.max(0, cols - left.length - right.length);

  return (
    <Box width={cols} height={1} flexDirection="row">
      <Text backgroundColor="cyan" color="black">{left}</Text>
      <Text backgroundColor="cyan" color="black">{' '.repeat(pad)}</Text>
      <Text backgroundColor="cyan" color="black">{right}</Text>
    </Box>
  );
};
