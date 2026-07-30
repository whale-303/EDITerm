/**
 * EditorPanel — wraps EditorPane with AUTO/VIM keyboard handling.
 *
 * Receives editor state as props from the parent (app.tsx). Handles all
 * text editing keyboard input when focus is on the editor.
 */
import React, { useEffect, useRef } from 'react';
import { Box } from 'ink';
import { EditorPane } from '../components/editor-pane.js';
import { useService } from '../hooks/use-service.js';
import { useEditorAPI } from '../hooks/use-service.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IEditorService } from '../../core/editor/editor-service.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';
import type { IModeService } from '../../core/interaction/mode-service.js';
import type { EditorMode, VimSubMode } from '../../core/interaction/mode-manager.js';
import type { SelectionRange } from '../app.js';
import type { Key, InputHandlerFn } from '../hooks/input-stack.js';

// ── Constants ─────────────────────────────────────

const SYMBOL_RE = /[a-zA-Z0-9_]/;

// ── Props ─────────────────────────────────────────

export interface EditorPanelProps {
  content: string[];
  setContent: React.Dispatch<React.SetStateAction<string[]>>;
  cursor: { row: number; col: number };
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>;
  scrollOffset: number;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  selection: SelectionRange | null;
  setSelection: React.Dispatch<React.SetStateAction<SelectionRange | null>>;
  editorWidth: number;
  editorHeight: number;
  onRegisterHandler: (id: string, fn: InputHandlerFn) => void;
  onUnregisterHandler: (id: string) => void;
}

// ── Component ─────────────────────────────────────

export const EditorPanel: React.FC<EditorPanelProps> = ({
  content, setContent, cursor, setCursor,
  scrollOffset, setScrollOffset, selection, setSelection,
  editorWidth, editorHeight,
  onRegisterHandler, onUnregisterHandler,
}) => {
  const api = useEditorAPI();
  const modeSvc = useService<IModeService>(TOKENS.ModeService);
  const focusSvc = useService<IFocusService>(TOKENS.FocusService);
  const editorSvc = useService<IEditorService>(TOKENS.EditorService);

  // Refs for latest state (avoid stale closure in handler)
  const contentRef = useRef(content);
  contentRef.current = content;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const visualAnchor = useRef<{ row: number; col: number } | null>(null);

  // Dirty marker — called explicitly by edit handlers, NOT passively by useEffect.
  // This guarantees dirty is only set when the user actually edits, never on file load.
  const markDirtyRef = useRef<() => void>(() => {});
  markDirtyRef.current = () => {
    const path = editorSvc.activePath;
    if (!path) return;
    const current = contentRef.current.join('\n');
    if (!editorSvc.isDirty(path)) {
      editorSvc.markDirty(path, current);
    } else {
      editorSvc.setDirtyCache(path, current);
    }
  };

  // When content matches loadedContent, the file is clean.
  // This catches the case where user undoes all changes back to baseline.
  useEffect(() => {
    const path = editorSvc.activePath;
    if (!path) return;
    const loaded = editorSvc.getLoadedContent(path);
    if (loaded === undefined) return;
    const current = contentRef.current.join('\n');
    if (loaded === current && editorSvc.isDirty(path)) {
      editorSvc.markClean(path);
    }
  }, [content, editorSvc]);

  // Register editor input handler (AUTO / VIM modes)
  useEffect(() => {
    const handler: InputHandlerFn = (_input: string, key: Key) => {
      // Only handle when focus is on editor
      if (focusSvc.current !== 'editor') return false;

      // ESC — let mode-transition handler deal with it
      if (key.escape) return false;

      const mm = modeSvc;

      // AUTO mode
      if (mm.mode === 'auto') {
        setSelection(null);
        handleAutoMode(_input, key, contentRef.current, cursorRef.current, setContent, setCursor, markDirtyRef);
        return true;
      }

      // VIM mode
      if (mm.mode === 'vim') {
        // Try mode transition first
        if (mm.tryTransition(_input)) {
          if ((mm.vimSubMode === 'visual' || mm.vimSubMode === 'visual-line' || mm.vimSubMode === 'visual-block') &&
              mm.vimSubMode !== (mm as any)._prevSub) {
            visualAnchor.current = { ...cursorRef.current };
            if (mm.vimSubMode === 'visual-line') visualAnchor.current.col = 0;
          }
          return true;
        }

        switch (mm.vimSubMode) {
          case 'vim-normal':
            setSelection(null);
            handleVimNormal(_input, key, contentRef.current, cursorRef.current, setCursor, editorHeight, setScrollOffset);
            break;
          case 'insert':
            setSelection(null);
            handleInsert(_input, key, contentRef.current, cursorRef.current, setContent, setCursor, markDirtyRef);
            break;
          case 'visual':
          case 'visual-line':
          case 'visual-block': {
            const moved = moveCursorVisual(_input, key, contentRef.current, cursorRef.current, setCursor, editorHeight, setScrollOffset);
            if (moved && visualAnchor.current) {
              const endCol = mm.vimSubMode === 'visual-line'
                ? (contentRef.current[cursorRef.current.row]?.length ?? 0)
                : cursorRef.current.col;
              setSelection(normalizeSelection(visualAnchor.current, { row: cursorRef.current.row, col: endCol }));
            }
            break;
          }
        }
        return true;
      }

      return false;
    };

    onRegisterHandler('editor', handler);
    return () => onUnregisterHandler('editor');
  }, [editorHeight, setContent, setCursor, setScrollOffset, setSelection, onRegisterHandler, onUnregisterHandler]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <EditorPane
        content={content}
        cursorRow={cursor.row}
        cursorCol={cursor.col}
        scrollOffset={scrollOffset}
        selection={selection}
        width={editorWidth}
        height={editorHeight}
      />
    </Box>
  );
};

// ── Helper: normalize selection range ─────────────

function normalizeSelection(
  a: { row: number; col: number },
  b: { row: number; col: number },
): SelectionRange {
  if (a.row < b.row || (a.row === b.row && a.col <= b.col)) {
    return { startRow: a.row, startCol: a.col, endRow: b.row, endCol: b.col };
  }
  return { startRow: b.row, startCol: b.col, endRow: a.row, endCol: a.col };
}

export type { SelectionRange };

// ── AUTO mode ──────────────────────────────────────

function handleAutoMode(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean;
         return: boolean; backspace: boolean; delete: boolean; },
  content: string[], cursor: { row: number; col: number },
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
  markDirtyRef: React.MutableRefObject<() => void>,
): void {
  if (key.upArrow)    { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) })); return; }
  if (key.downArrow)  { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 1) })); return; }
  if (key.leftArrow)  { setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1) })); return; }
  if (key.rightArrow) { setCursor((c) => ({ ...c, col: Math.min(content[c.row]?.length ?? 0, c.col + 1) })); return; }
  if (input === '\x1b[H' || input === '\x1b[1~' || input === '\x1bOH') { setCursor((c) => ({ ...c, col: 0 })); return; }
  if (input === '\x1b[F' || input === '\x1b[4~' || input === '\x1bOF') { setCursor((c) => ({ ...c, col: content[c.row]?.length ?? 0 })); return; }
  if (input === '\x1b[5~') { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 10) })); return; }
  if (input === '\x1b[6~') { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 10) })); return; }
  handleInsert(input, key, content, cursor, setContent, setCursor, markDirtyRef);
}

// ── VIM normal ─────────────────────────────────────

function handleVimNormal(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; },
  content: string[],
  _cursor: { row: number; col: number },
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
  editorHeight: number,
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>,
): void {
  if (key.upArrow    || input === 'k') { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) })); return; }
  if (key.downArrow  || input === 'j') { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 1) })); return; }
  if (key.leftArrow  || input === 'h') { setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1) })); return; }
  if (key.rightArrow || input === 'l') { setCursor((c) => ({ ...c, col: Math.min(content[c.row]?.length ?? 0, c.col + 1) })); return; }
  if (input === '\x15') { setScrollOffset((s) => Math.max(0, s - Math.floor(editorHeight / 2))); return; }
  if (input === '\x04') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + Math.floor(editorHeight / 2))); return; }
  if (input === '\x02') { setScrollOffset((s) => Math.max(0, s - editorHeight)); return; }
  if (input === '\x06') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + editorHeight)); return; }
  if (input === 'g') { setScrollOffset(0); setCursor((c) => ({ ...c, row: 0 })); return; }
  if (input === 'G') { setScrollOffset(Math.max(0, content.length - editorHeight)); setCursor((c) => ({ ...c, row: content.length - 1 })); return; }
}

// ── VIM visual — cursor movement ──────────────────

function moveCursorVisual(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; },
  content: string[],
  cursor: { row: number; col: number },
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
  editorHeight: number,
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>,
): boolean {
  if (key.upArrow    || input === 'k') { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) })); return true; }
  if (key.downArrow  || input === 'j') { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 1) })); return true; }
  if (key.leftArrow  || input === 'h') { setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1) })); return true; }
  if (key.rightArrow || input === 'l') { setCursor((c) => ({ ...c, col: Math.min(content[c.row]?.length ?? 0, c.col + 1) })); return true; }
  if (input === '\x15') { setScrollOffset((s) => Math.max(0, s - Math.floor(editorHeight / 2))); return true; }
  if (input === '\x04') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + Math.floor(editorHeight / 2))); return true; }
  if (input === '\x02') { setScrollOffset((s) => Math.max(0, s - editorHeight)); return true; }
  if (input === '\x06') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + editorHeight)); return true; }
  if (input === 'g') { setScrollOffset(0); setCursor((c) => ({ ...c, row: 0 })); return true; }
  if (input === 'G') { setScrollOffset(Math.max(0, content.length - editorHeight)); setCursor((c) => ({ ...c, row: content.length - 1 })); return true; }
  if (input === 'w') {
    setCursor((c) => {
      const line = content[c.row]; let col = c.col;
      while (col < line.length && SYMBOL_RE.test(line[col])) col++;
      while (col < line.length && !SYMBOL_RE.test(line[col])) col++;
      return { ...c, col: Math.min(line.length, col) };
    });
    return true;
  }
  if (input === 'b') {
    setCursor((c) => {
      const line = content[c.row]; let col = c.col - 1;
      if (col < 0) return { ...c, col: 0 };
      while (col > 0 && !SYMBOL_RE.test(line[col])) col--;
      while (col > 0 && SYMBOL_RE.test(line[col - 1])) col--;
      return { ...c, col };
    });
    return true;
  }
  return false;
}

// ── INSERT mode ────────────────────────────────────

function handleInsert(
  input: string,
  key: { return: boolean; backspace: boolean; delete: boolean },
  content: string[],
  cursor: { row: number; col: number },
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
  markDirtyRef: React.MutableRefObject<() => void>,
): void {
  setContent((prev) => {
    const lines = [...prev];
    const line = lines[cursor.row];
    if (line === undefined) return lines;

    if (key.return) {
      lines[cursor.row] = line.slice(0, cursor.col);
      lines.splice(cursor.row + 1, 0, line.slice(cursor.col));
      setCursor((c) => ({ row: c.row + 1, col: 0 }));
      return lines;
    }
    if (key.backspace) {
      if (cursor.col > 0) {
        lines[cursor.row] = line.slice(0, cursor.col - 1) + line.slice(cursor.col);
        setCursor((c) => ({ ...c, col: c.col - 1 }));
      } else if (cursor.row > 0) {
        const prevLen = lines[cursor.row - 1].length;
        lines[cursor.row - 1] += line;
        lines.splice(cursor.row, 1);
        setCursor((c) => ({ row: c.row - 1, col: prevLen }));
      }
      return lines;
    }
    if (key.delete) {
      if (cursor.col < line.length) {
        lines[cursor.row] = line.slice(0, cursor.col) + line.slice(cursor.col + 1);
      } else if (cursor.row < lines.length - 1) {
        lines[cursor.row] += lines[cursor.row + 1];
        lines.splice(cursor.row + 1, 1);
      }
      return lines;
    }
    if (input && input.length >= 1) {
      if (input.includes('\n') || input.includes('\r')) {
        const parts = input.split(/\r?\n/);
        lines[cursor.row] = line.slice(0, cursor.col) + parts[0];
        for (let j = 1; j < parts.length; j++) {
          lines.splice(cursor.row + j, 0, parts[j]);
        }
        const lastPart = parts[parts.length - 1];
        setCursor((c) => ({ row: c.row + parts.length - 1, col: lastPart.length }));
      } else {
        lines[cursor.row] = line.slice(0, cursor.col) + input + line.slice(cursor.col);
        setCursor((c) => ({ ...c, col: c.col + input.length }));
      }
    }
    return lines;
  });
  // Only mark dirty for actual content-modifying keystrokes
  if (key.return || key.backspace || key.delete || (input && input.length >= 1)) {
    markDirtyRef.current();
  }
}
