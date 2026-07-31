import React, { useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import type { FileEntry } from '../../types/index.js';
import type { GitFileStatus } from '../../services/git/igit-service.js';

export interface SidebarProps {
  entries: FileEntry[];
  activePath?: string;
  selectedPath?: string;
  dirtyFiles?: Set<string> | ReadonlySet<string>;
  /** Map of path → git file status (for tree colouring). */
  gitStatus?: Map<string, GitFileStatus>;
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
  entries, activePath, selectedPath, dirtyFiles, gitStatus, onSelectFile,
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
            gitStatus={gitStatus}
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
  gitStatus?: Map<string, GitFileStatus>;
  onSelectFile?: (e: FileEntry) => void;
  depth: number;
  maxWidth: number;
}> = ({ entry, activePath, selectedPath, dirtyFiles, gitStatus, onSelectFile, depth, maxWidth }) => {
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

  // Look up git status — if this path isn't directly in the map
  // (e.g. a file inside an untracked directory), walk up parent dirs.
  const git = lookupGitStatus(entry.path, gitStatus);

  // Git status colour → file name colour (except active/selected)
  const gitColor = gitFileNameColor(git?.status);

  return (
    <Box>
      <Text>
        {indent}{isSelected ? '▶' : ' '} {icon}{' '}
      </Text>
      <Text color={isDirty ? 'yellow' : undefined}>
        {dirtyMark}
      </Text>
      <Text bold={isActive} inverse={isSelected} color={gitColor}>
        {displayName}
      </Text>
    </Box>
  );
};

/** Look up git status for a path.
 *  - Direct hit: return immediately (includes propagated directory colours).
 *  - Walk up: only inherit from NON-propagated 'added' entries (untracked
 *    directories listed directly by porcelain, e.g. "?? newdir/"). Sibling
 *    files never leak colour through propagated ancestor directories. */
function lookupGitStatus(
  entryPath: string,
  statusMap?: Map<string, GitFileStatus>,
): GitFileStatus | undefined {
  if (!statusMap || statusMap.size === 0) return undefined;

  const direct = statusMap.get(entryPath);
  if (direct) return direct;

  let dir = parentDir(entryPath);
  while (dir) {
    const s = statusMap.get(dir);
    // Only inherit 'added' from a direct porcelain hit — skip propagated dirs
    if (s && !s.propagated && s.status === 'added') return s;
    dir = parentDir(dir);
  }
  return undefined;
}

/** "/src/foo/bar" → "/src/foo", "/src" → undefined. */
function parentDir(p: string): string | undefined {
  const last = p.lastIndexOf('/');
  if (last <= 0) return undefined;
  return p.slice(0, last);
}

/** Map git file status to Ink colour. */
function gitFileNameColor(status?: string): string | undefined {
  switch (status) {
    case 'added':
    case 'untracked':
      return '#a6e3a1'; // green
    case 'modified':
      return '#f9e2af'; // yellow
    case 'deleted':
      return '#f38ba8'; // red
    case 'renamed':
      return '#89b4fa'; // blue
    default:
      return undefined; // default foreground
  }
}
