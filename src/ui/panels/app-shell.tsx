/**
 * AppShell — top-level layout that composes the main panels.
 * Pure composition, no business logic.
 */
import React from 'react';
import { Box } from 'ink';
import { SidebarPanel } from './sidebar-panel.js';
import { EditorPanel } from './editor-panel.js';
import { OverlayLayer } from './overlay-layer.js';
import { StatusBarPanel } from './status-bar-panel.js';
import type { SelectionRange } from './editor-panel.js';
import type { InputHandlerFn } from '../hooks/input-stack.js';

export interface AppShellProps {
  cols: number;
  rows: number;
  mode: string;
  sidebarWidth: number;
  editorHeight: number;
  content: string[];
  setContent: React.Dispatch<React.SetStateAction<string[]>>;
  cursor: { row: number; col: number };
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>;
  scrollOffset: number;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  selection: SelectionRange | null;
  setSelection: React.Dispatch<React.SetStateAction<SelectionRange | null>>;
  showPalette: boolean;
  onClosePalette: () => void;
  promptValue: string;
  promptCursor: number;
  onRegisterHandler: (id: string, fn: InputHandlerFn) => void;
  onUnregisterHandler: (id: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  cols, rows, mode, sidebarWidth, editorHeight,
  content, setContent, cursor, setCursor,
  scrollOffset, setScrollOffset, selection, setSelection,
  showPalette, onClosePalette, promptValue, promptCursor,
  onRegisterHandler, onUnregisterHandler,
}) => {
  const editorWidth = mode === 'normal' ? cols - sidebarWidth : cols;

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="row" width={cols} height={editorHeight}>
        {mode === 'normal' && (
          <SidebarPanel width={sidebarWidth} editorHeight={editorHeight} />
        )}
        <EditorPanel
          content={content}
          setContent={setContent}
          cursor={cursor}
          setCursor={setCursor}
          scrollOffset={scrollOffset}
          setScrollOffset={setScrollOffset}
          selection={selection}
          setSelection={setSelection}
          editorWidth={editorWidth}
          editorHeight={editorHeight}
          onRegisterHandler={onRegisterHandler}
          onUnregisterHandler={onUnregisterHandler}
        />
      </Box>

      <OverlayLayer
        cols={cols}
        rows={rows}
        showPalette={showPalette}
        onClosePalette={onClosePalette}
        promptValue={promptValue}
        promptCursor={promptCursor}
      />

      <StatusBarPanel
        cols={cols}
        cursorRow={cursor.row}
        cursorCol={cursor.col}
      />
    </Box>
  );
};
