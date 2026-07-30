import React from 'react';
import { Box, Text } from 'ink';
import type { FileEntry } from '../../types/index.js';

interface FileTreeProps {
  entries: FileEntry[];
  activePath?: string;
  onSelect?: (entry: FileEntry) => void;
  indent?: number;
}

export const FileTree: React.FC<FileTreeProps> = ({
  entries,
  activePath,
  onSelect,
  indent = 0,
}) => {
  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <FileTreeItem
          key={entry.path}
          entry={entry}
          isActive={entry.path === activePath}
          onSelect={onSelect}
          indent={indent}
        />
      ))}
    </Box>
  );
};

const FileTreeItem: React.FC<{
  entry: FileEntry;
  isActive: boolean;
  onSelect?: (e: FileEntry) => void;
  indent: number;
}> = ({ entry, isActive, onSelect, indent }) => {
  const prefix = entry.isDirectory ? '📁' : '📄';
  const label = entry.isDirectory ? `${entry.name}/` : entry.name;

  return (
    <Box flexDirection="column">
      <Box paddingLeft={indent}>
        <Text inverse={isActive}>
          {'  '.repeat(indent)}{prefix} {label}
        </Text>
      </Box>
      {entry.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          isActive={false}
          onSelect={onSelect}
          indent={indent + 1}
        />
      ))}
    </Box>
  );
};
