import React from 'react';
import { Box } from 'ink';
import type { PanelOrientation } from '../../types/index.js';

interface SplitPaneProps {
  orientation: PanelOrientation;
  /** Ratio of first child (0–1), defaults to 0.5 */
  ratio?: number;
  first: React.ReactNode;
  second: React.ReactNode;
}

/**
 * A split pane using Ink's flex layout.
 * Phase 1: fixed ratio split.
 * Phase 2: drag-to-resize via mouse events.
 */
export const SplitPane: React.FC<SplitPaneProps> = ({
  orientation,
  ratio = 0.5,
  first,
  second,
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <Box
      width="100%"
      height="100%"
      flexDirection={isHorizontal ? 'row' : 'column'}
    >
      <Box width={isHorizontal ? `${Math.round(ratio * 100)}%` : undefined}>
        {first}
      </Box>
      {/* Divider */}
      <Box width={1} flexDirection="column">
        <Text dimColor>{isHorizontal ? '│' : '─'}</Text>
      </Box>
      <Box flexGrow={1}>{second}</Box>
    </Box>
  );
};

// Import needed for divider
import { Text } from 'ink';
