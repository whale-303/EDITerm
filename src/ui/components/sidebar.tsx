import React, { useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import type { FileEntry } from '../../types/index.js';

export interface SidebarProps {
  entries: FileEntry[];
  activePath?: string;
  selectedPath?: string;
  dirtyFiles?: Set<string> | ReadonlySet<string>;
  onSelectFile?: (entry: FileEntry) => void;
  width: number;
  /** Available rows for the tree body (header already subtracted). */
  height: number;
  /** Set of expanded directory paths. */
  expandedPaths?: Set<string>;
}

interface FlatNode {
  entry: FileEntry;
  depth: number;
}

/** Flatten tree respecting expanded directories. */
function flattenTree(entries: FileEntry[], expanded: Set<string>, depth: number): FlatNode[] {
  const result: FlatNode[] = [];
  for (const e of entries) {
    result.push({ entry: e, depth });
    if (e.children && e.isDirectory && expanded.has(e.path)) {
      result.push(...flattenTree(e.children, expanded, depth + 1));
    }
  }
  return result;
}

export const Sidebar: React.FC<SidebarProps> = ({
  entries, activePath, selectedPath, dirtyFiles, onSelectFile,
  width, height, expandedPaths,
}) => {
  const expanded = expandedPaths ?? new Set<string>();

  // Flatten tree respecting expansion state. Root entries included at depth 0.
  const flat = useMemo(
    () => entries.flatMap((e) => {
      const nodes: FlatNode[] = [{ entry: e, depth: 0 }];
      if (e.children && e.isDirectory && expanded.has(e.path)) {
        nodes.push(...flattenTree(e.children, expanded, 1));
      }
      return nodes;
    }),
    [entries, expanded],
  );

  // Track previous scroll offset so we can clamp smoothly
  const prevOffsetRef = useRef(0);

  // Auto-scroll: keep selected entry in view
  const scrollOffset = useMemo(() => {
    if (height <= 0 || flat.length <= height) return 0;
    const selIdx = flat.findIndex((n) => n.entry.path === selectedPath);
    if (selIdx < 0) return prevOffsetRef.current;

    const prev = prevOffsetRef.current;
    const visibleStart = prev;
    const visibleEnd = prev + height;
    const visiblyInside = selIdx >= visibleStart && selIdx < visibleEnd;

    if (visiblyInside) {
      return prev; // no scroll needed
    }

    let next: number;
    if (selIdx < visibleStart) {
      // Selection above → scroll up, place selection at top
      next = selIdx;
    } else {
      // Selection below → scroll down, place selection at bottom
      next = selIdx - height + 1;
    }
    next = Math.max(0, Math.min(next, flat.length - height));
    prevOffsetRef.current = next;
    return next;
  }, [flat, selectedPath, height]);

  const visible = flat.slice(scrollOffset, scrollOffset + height);

  // Scroll indicators
  const hasAbove = scrollOffset > 0;
  const hasBelow = scrollOffset + height < flat.length;

  return (
    <Box flexDirection="column" width={width} borderStyle="single" paddingLeft={0}>
      <Box>
        <Text bold> WORKSPACE </Text>
        {hasAbove && <Text dimColor> ↑</Text>}
      </Box>
      <Box>
        <Text dimColor>
          {hasAbove ? '▲' : '─'}{'─'.repeat(Math.max(0, width - 4))}{hasBelow ? '▼' : '─'}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map(({ entry, depth }) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            activePath={activePath}
            selectedPath={selectedPath}
            dirtyFiles={dirtyFiles}
            onSelectFile={onSelectFile}
            depth={depth}
            maxWidth={width - 2}
          />
        ))}
      </Box>
    </Box>
  );
};

const FileTreeNode: React.FC<{
  entry: FileEntry;
  activePath?: string;
  selectedPath?: string;
  dirtyFiles?: Set<string> | ReadonlySet<string>;
  onSelectFile?: (e: FileEntry) => void;
  depth: number;
  maxWidth: number;
}> = ({ entry, activePath, selectedPath, dirtyFiles, onSelectFile, depth, maxWidth }) => {
  const isSelected = selectedPath === entry.path;
  const isActive = activePath === entry.path;
  const isDirty = dirtyFiles?.has(entry.path) ?? false;
  const icon = entry.isDirectory ? '📁' : '📄';
  const dirtyMark = isDirty ? '● ' : '';
  const indent = '  '.repeat(depth);
  const available = maxWidth - indent.length - 6; // dirtyMark + icon + space + name
  const displayName = entry.name.length > available
    ? entry.name.slice(0, available - 1) + '…'
    : entry.name;

  return (
    <Box>
      <Text>
        {indent}{isSelected ? '▶' : ' '} {icon}{' '}
      </Text>
      <Text color={isDirty ? 'yellow' : undefined}>
        {dirtyMark}
      </Text>
      <Text bold={isActive} inverse={isSelected}>
        {displayName}
      </Text>
    </Box>
  );
};
