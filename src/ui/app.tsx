import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { Box, useInput, Text } from 'ink';
import { existsSync, statSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { EditorPane } from './components/editor-pane.js';
import { StatusBar } from './components/status-bar.js';
import { CommandPalette } from './components/command-palette.js';
import { Sidebar } from './components/sidebar.js';
import { NotifyStack } from './components/notify.js';
import type { NotifyItem } from './components/notify.js';
import { ContextMenu, useContextMenu } from './components/context-menu.js';
import type { MenuItem, MenuState } from './components/context-menu.js';
import { InputContext } from './hooks/input-context.js';
import { useInputStack } from './hooks/input-stack.js';
import type { Key } from './hooks/input-stack.js';
import { ModeManager } from '../core/interaction/mode-manager.js';
import { WorkspaceFileService } from '../services/file/workspace-service.js';
import { SSHFileService } from '../services/file/ssh-service.js';
import type { IFileService } from '../services/file/ifile-service.js';
import type { EditorMode, VimSubMode } from '../core/interaction/mode-manager.js';
import type { MouseEvent } from '../core/interaction/mouse-protocol.js';
import type { FileEntry } from '../types/index.js';

// ── Constants ─────────────────────────────────────────

const SGR_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
const SYMBOL_RE = /[a-zA-Z0-9_]/;

// ── Focus type ───────────────────────────────────────

type FocusTarget = 'sidebar' | 'editor' | 'menu' | 'notify' | 'prompt';

// ── Selection type ────────────────────────────────────

/** Multi-line selection range. start≤end (normalized). */
export interface SelectionRange {
  startRow: number;
  startCol: number; // inclusive
  endRow: number;   // inclusive
  endCol: number;   // exclusive
}

function normalizeSelection(
  a: { row: number; col: number },
  b: { row: number; col: number },
): SelectionRange {
  if (a.row < b.row || (a.row === b.row && a.col <= b.col)) {
    return { startRow: a.row, startCol: a.col, endRow: b.row, endCol: b.col };
  }
  return { startRow: b.row, startCol: b.col, endRow: a.row, endCol: a.col };
}

export interface AppProps {
  mouseSink: { cb: ((e: MouseEvent) => void) | null };
}

// ── Component ─────────────────────────────────────────

export const App: React.FC<AppProps> = ({ mouseSink }) => {
  const [rows, setRows] = useState(process.stdout.rows || 24);
  const [cols, setCols] = useState(process.stdout.columns || 80);

  const modeRef = useRef(new ModeManager());
  const [mode, setMode] = useState<EditorMode>('normal');
  const [vimSub, setVimSub] = useState<VimSubMode>('vim-normal');

  // Mouse
  const [mouse, setMouse] = useState<MouseEvent | null>(null);
  const consumeMouse = useCallback(() => setMouse(null), []);
  mouseSink.cb = (e: MouseEvent) => { setMouse(e); };

  // Editor
  const [content, setContent] = useState<string[]>([
    '', '', '  ██████╗ ██████╗ ██╗████████╗███████╗██████╗ ███╗   ███╗',
    '', '  ██╔══██╗██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗████╗ ████║',
    '', '  ██████╔╝██║  ██║██║   ██║   █████╗  ██████╔╝██╔████╔██║',
    '', '  ██╔══██╗██║  ██║██║   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║',
    '', '  ██████╔╝██████╔╝██║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║',
    '', '  ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝',
    '', '', '  Welcome to EDITerm!', '',
    '  a/Enter → AUTO  │  v       → VIM',
    '  Esc     → NORMAL (hub)',
  ]);
  const [cursor, setCursor] = useState({ row: 20, col: 2 });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const visualAnchor = useRef<{ row: number; col: number } | null>(null);
  const [showPalette, setShowPalette] = useState(false);

  // Sidebar / workspace
  const workspacePath = './test_workspace';
  const vfs = useRef<IFileService>(new WorkspaceFileService(workspacePath));
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [sidebarPath, setSidebarPath] = useState<string>('/');   // highlighted in tree
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [treeFocus, setTreeFocus] = useState(true);                // sidebar has keyboard focus (NORMAL default)
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set(['/']));
  const treeExpandedRef = useRef(treeExpanded);
  treeExpandedRef.current = treeExpanded;

  // Dirty file tracking: path → content when loaded (for conflict detect)
  const contentRef = useRef(content);
  contentRef.current = content;
  const fileLoadedContent = useRef<Map<string, string>>(new Map());
  const dirtyFiles = useRef<Set<string>>(new Set());
  const dirtyContentCache = useRef<Map<string, string>>(new Map()); // staged dirty content for file switching
  const [, setDirtyTick] = useState(0); // force re-render for sidebar icons

  // Context menu (reusable — E key, right-click)
  const { menu, showMenu, closeMenu } = useContextMenu();

  // Internal clipboard (for copy/cut/paste)
  const clipboard = useRef<{ path: string; cut: boolean } | null>(null);

  // Prompt mode (for rename, new file, new dir)
  const [prompt, setPrompt] = useState<{
    title: string; defaultValue: string;
    onConfirm: (value: string) => void; onCancel: () => void;
    password?: boolean;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState<NotifyItem[]>([]);
  const notifyId = useRef(0);

  const addNotify = (message: string, actions: NotifyItem['actions'], timeout?: number): number => {
    const id = ++notifyId.current;
    setNotifications((prev) => [...prev, { id, message, actions, timeout }]);
    return id;
  };

  const dismissNotify = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // ── SSH Connect callback ──────────────────────────
  const connectSSH = useCallback((connStr: string) => {
    // Format: ssh user@host [-p port] [/remote/path]
    // Examples: ssh root@192.168.1.1
    //           ssh user@example.com -p 2222 /home/projects
    const trimmed = connStr.trim();
    // Strip leading "ssh " if present
    let rest = trimmed.startsWith('ssh ') ? trimmed.slice(4).trim() : trimmed;
    let port = 22;
    let remoteRoot = '/';

    // Extract -p <port>
    const portMatch = rest.match(/^(.*?)\s+-p\s+(\d+)(?:\s+(.*))?$/);
    if (portMatch) {
      rest = portMatch[1];
      port = parseInt(portMatch[2], 10);
      if (portMatch[3]) remoteRoot = portMatch[3];
    } else {
      // Extract optional path after host
      const pathMatch = rest.match(/^(\S+)\s+(.+)$/);
      if (pathMatch) {
        rest = pathMatch[1];
        remoteRoot = pathMatch[2];
      }
    }

    const host = rest;
    if (!host || !host.includes('@')) {
      addNotify('Format: ssh user@host [-p port] [/path]', [], 5000);
      return;
    }

    // Chain password prompt
    setPrompt({
      title: `Password for ${host}`,
      defaultValue: '',
      password: true,
      onConfirm: (password) => {
        setPrompt(null);
        try {
          const ssh = new SSHFileService({ host, port, remoteRoot, password: password || undefined });
          vfs.current = ssh;
          // Clear editor state
          setActiveFilePath(null);
          setContent(['']);
          setCursor({ row: 0, col: 0 });
          dirtyFiles.current.clear();
          dirtyContentCache.current.clear();
          fileLoadedContent.current.clear();
          setDirtyTick((t) => t + 1);
          setSidebarPath('/');
          setFileTree([]);
          ssh.listDir('/').then(setFileTree).catch(() => {
            addNotify(`SSH connection failed: ${host}`, [], 5000);
            vfs.current = new WorkspaceFileService('./test_workspace');
            vfs.current.listDir('/').then(setFileTree);
          });
          addNotify(`Connected: ${ssh.basePath}`, [], 5000);
        } catch (e: any) {
          addNotify(`SSH error: ${e.message}`, [], 5000);
        }
      },
      onCancel: () => setPrompt(null),
    });
    setPromptValue('');
  }, []);

  // Load file tree on mount
  useEffect(() => {
    vfs.current.listDir('/').then(setFileTree);
  }, []);

  // ── Raw stdin handler — F3 key (Ink parses \x1b[[C as rightArrow, drops it) ──
  useEffect(() => {
    let buf = '';

    const handler = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buf += str;

      let idx = 0;
      while ((idx = buf.indexOf('\x1b[[C', idx)) !== -1) {
        process.stdout.write('\x07'); // BELL
        cycleFocusRef.current();
        idx += 4;
      }
      // Keep trailing bytes that might start a partial F3 prefix
      if (buf.length > 3) {
        const tail = buf.slice(-3);
        if (tail.startsWith('\x1b') || '\x1b[[C'.startsWith(tail)) {
          buf = tail;
        } else {
          buf = '';
        }
      }
    };
    process.stdin.on('data', handler);
    return () => { process.stdin.off('data', handler); };
  }, []);

  // Reset tree focus when returning to NORMAL mode
  useEffect(() => {
    if (mode === 'normal') setTreeFocus(true);
  }, [mode]);

  // Mark active file dirty when editor content changes
  useEffect(() => {
    if (!activeFilePath) return;
    const loaded = fileLoadedContent.current.get(activeFilePath);
    if (loaded === undefined) return; // not tracked yet (loading in progress)
    const current = content.join('\n');
    if (loaded !== current) {
      if (!dirtyFiles.current.has(activeFilePath)) {
        dirtyFiles.current.add(activeFilePath);
        setDirtyTick((t) => t + 1);
      }
    } else {
      if (dirtyFiles.current.has(activeFilePath)) {
        dirtyFiles.current.delete(activeFilePath);
        setDirtyTick((t) => t + 1);
      }
    }
  }, [content, activeFilePath]);

  const editorHeight = rows - 1;

  // Resize
  useEffect(() => {
    const onResize = () => {
      setRows(process.stdout.rows || 24);
      setCols(process.stdout.columns || 80);
    };
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    setScrollOffset((s) => {
      if (cursor.row < s) return cursor.row;
      if (cursor.row >= s + editorHeight) return cursor.row - editorHeight + 1;
      return s;
    });
  }, [cursor.row, editorHeight]);

  // Mouse → actions
  useEffect(() => {
    if (!mouse) return;
    const gutterWidth = 5;

    if (mouse.type === 'scroll-up') {
      setScrollOffset((s) => Math.max(0, s - 3));
      consumeMouse(); return;
    }
    if (mouse.type === 'scroll-down') {
      setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + 3));
      consumeMouse(); return;
    }

    if (mouse.type === 'press' && mouse.button === 'left') {
      // Close context menu on left-click outside menu area
      if (menu) { closeMenu(); consumeMouse(); return; }
      if (mode === 'auto' || mode === 'vim') {
        const editorCol = mouse.col - gutterWidth;
        if (editorCol >= 0) {
          const newRow = Math.min(content.length - 1, scrollOffset + mouse.row);
          setCursor({ row: newRow, col: editorCol });
        }
      }
    }
    if (mouse.type === 'press' && mouse.button === 'right') {
      // Right-click on sidebar file → context menu
      if (mode === 'normal' && mouse.col < sidebarWidth) {
        const sidebarRow = mouse.row - 2; // skip title + divider
        if (sidebarRow >= 0) {
          const flat = flattenTreeWithRoot(fileTree, treeExpandedRef.current);
          if (sidebarRow < flat.length) {
            const entry = flat[sidebarRow];
            const isDirty = dirtyFiles.current.has(entry.path) || dirtyContentCache.current.has(entry.path);
            const isActive = entry.path === activeFilePath;
            // Reset highlight BEFORE setMenu so render picks up the reset value
            menuHighlightRef.current = 0;
            setMenuHLTick(0);
            showContextMenu(entry, isDirty, isActive, Math.min(mouse.col, cols - 32), Math.min(mouse.row, rows - 12),
              vfs.current, clipboard, dirtyFiles, dirtyContentCache, fileLoadedContent,
              contentRef, setContent, setDirtyTick, addNotify, dismissNotify,
              () => { vfs.current.listDir('/').then(setFileTree); },
              (title, def, onConfirm) => { setPrompt({ title, defaultValue: def, onConfirm, onCancel: () => setPrompt(null) }); setPromptValue(def); },
              setActiveFilePath, setSidebarPath, showMenu, connectSSH);
          }
        }
      }
    }
    consumeMouse();
  }, [mouse, mode, content.length, scrollOffset, editorHeight, consumeMouse]);

  // ── Input capture stack ────────────────────────────
  const inputStack = useInputStack();
  const menuHighlightRef = useRef(0);
  const [, setMenuHLTick] = useState(0);
  const menuHighlight = menuHighlightRef.current; // read on each render

  // ── Focus management (F3 to cycle) ──────────────────
  const [focusTarget, setFocusTarget] = useState<FocusTarget>('sidebar');
  const focusRef = useRef(focusTarget);
  focusRef.current = focusTarget;

  // Compute which focus targets F3 can cycle through.
  // Normal: sidebar (NOT editor).  Auto/Vim: editor (NOT sidebar).
  const getAvailableTargets = useCallback((): FocusTarget[] => {
    const targets: FocusTarget[] = [];
    if (notifications.some(n => n.actions.length > 0)) targets.push('notify');
    if (menu !== null) targets.push('menu');
    if (prompt !== null) targets.push('prompt');
    if (mode === 'normal') {
      targets.push('sidebar');
    } else {
      targets.push('editor');
    }
    return targets;
  }, [notifications, menu, prompt, mode]);

  // Cycle to next available focus target
  const cycleFocus = useCallback(() => {
    const available = getAvailableTargets();
    const current = focusRef.current;
    const idx = available.indexOf(current);
    const next = available[(idx + 1) % available.length];
    if (next === current) return; // no change
    setFocusTarget(next);
    // Side effects when focus changes
    if (next === 'editor') {
      setTreeFocus(false);
      if (mode !== 'auto' && mode !== 'vim') {
        modeRef.current.setMode('auto');
        setMode('auto');
      }
    } else if (next === 'sidebar') {
      setTreeFocus(true);
      if (mode !== 'normal') {
        modeRef.current.setMode('normal');
        setMode('normal');
      }
    } else {
      setTreeFocus(false);
    }
  }, [getAvailableTargets]);

  // Keep cycleFocus ref for Alt timer callback
  const cycleFocusRef = useRef(cycleFocus);
  cycleFocusRef.current = cycleFocus;

  // Auto-focus popups when they open (useLayoutEffect = synchronous, no flash)
  useLayoutEffect(() => {
    if (menu) setFocusTarget('menu');
  }, [menu]);
  useLayoutEffect(() => {
    if (notifications.some(n => n.actions.length > 0)) setFocusTarget('notify');
  }, [notifications]);
  useLayoutEffect(() => {
    if (prompt) setFocusTarget('prompt');
  }, [prompt]);

  // ── Restore focus when popups close (useLayoutEffect = synchronous, no stale frame) ──

  const prevMenuOpenRef = useRef(menu !== null);
  useLayoutEffect(() => {
    const wasOpen = prevMenuOpenRef.current;
    const isOpen = menu !== null;
    prevMenuOpenRef.current = isOpen;
    if (wasOpen && !isOpen && focusRef.current === 'menu') {
      const target = mode === 'normal' ? 'sidebar' : 'editor';
      setFocusTarget(target as FocusTarget);
      setTreeFocus(target === 'sidebar');
    }
  }, [menu, mode]);

  const prevNotifyHasActionsRef = useRef(notifications.some(n => n.actions.length > 0));
  useLayoutEffect(() => {
    const hadActions = prevNotifyHasActionsRef.current;
    const hasActions = notifications.some(n => n.actions.length > 0);
    prevNotifyHasActionsRef.current = hasActions;
    if (hadActions && !hasActions && focusRef.current === 'notify') {
      const target = mode === 'normal' ? 'sidebar' : 'editor';
      setFocusTarget(target as FocusTarget);
      setTreeFocus(target === 'sidebar');
    }
  }, [notifications, mode]);

  const prevPromptRef = useRef(prompt);
  useLayoutEffect(() => {
    const hadPrompt = prevPromptRef.current !== null;
    const hasPrompt = prompt !== null;
    prevPromptRef.current = prompt;
    if (hadPrompt && !hasPrompt && focusRef.current === 'prompt') {
      const target = mode === 'normal' ? 'sidebar' : 'editor';
      setFocusTarget(target as FocusTarget);
      setTreeFocus(target === 'sidebar');
    }
  }, [prompt, mode]);

  // Sync focus with mode changes from external actions (file open → editor, VIM ESC → sidebar)
  const prevModeRef = useRef(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    // Only react to transitions (not initial mount)
    if (prev === mode) return;
    if ((mode === 'auto' || mode === 'vim') && prev === 'normal') {
      // File opened or mode switched → focus editor
      setFocusTarget('editor');
      setTreeFocus(false);
    } else if (mode === 'normal' && (prev === 'auto' || prev === 'vim')) {
      // Returned from editor → focus sidebar
      setFocusTarget('sidebar');
      setTreeFocus(true);
    }
  }, [mode]);

  // Refs for state values accessed inside the stable base handler
  const treeFocusRef = useRef(treeFocus);
  treeFocusRef.current = treeFocus;
  const showPaletteRef = useRef(showPalette);
  showPaletteRef.current = showPalette;
  const activeFilePathRef = useRef(activeFilePath);
  activeFilePathRef.current = activeFilePath;
  const fileTreeRef = useRef(fileTree);
  fileTreeRef.current = fileTree;
  const sidebarPathRef = useRef(sidebarPath);
  sidebarPathRef.current = sidebarPath;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const contentStateRef = useRef(content);
  contentStateRef.current = content;

  // Base handler — registered once, routes input based on current focus target
  useEffect(() => {
    inputStack.push('base', (_input: string, key: Key) => {
      const mm = modeRef.current;
      const ft = focusRef.current;

      // ── Global shortcuts (always active) ──────────────

      // F3 — cycle focus target (also caught by raw stdin handler)
      if (_input === '\x1b[[C') {
        process.stdout.write('\x07');
        cycleFocusRef.current();
        return true;
      }

      // Ctrl+B (0x02) — toggle sidebar ↔ editor focus
      if (_input === '\x02') {
        if (ft === 'editor') { setFocusTarget('sidebar'); setTreeFocus(true); }
        else { setFocusTarget('editor'); setTreeFocus(false); }
        return true;
      }

      // Ctrl+P (0x10) — command palette
      if (_input === '\x10') { setShowPalette((v) => !v); return true; }

      // ESC — toggle Normal ↔ Auto
      if (key.escape) {
        if (showPaletteRef.current) { setShowPalette(false); return true; }
        if (mm.mode === 'normal') {
          modeRef.current.setMode('auto'); setMode('auto');
          setFocusTarget('editor'); setTreeFocus(false);
        } else {
          modeRef.current.setMode('normal'); setMode('normal');
          setFocusTarget('sidebar'); setTreeFocus(true);
          setSelection(null); visualAnchor.current = null;
        }
        return true;
      }

      // ── Focus-based routing ───────────────────────────

      // Menu / Notify / Prompt → their own handlers manage input; base passes through
      if (ft === 'menu' || ft === 'notify' || ft === 'prompt') {
        return false;
      }

      // ── Sidebar focus (Normal mode) ────────────────────
      if (ft === 'sidebar') {
        // E — open context menu
        if (_input === 'e' || _input === 'E') {
          const flat = flattenTreeWithRoot(fileTreeRef.current, treeExpandedRef.current);
          const idx = flat.findIndex((e) => e.path === sidebarPathRef.current);
          if (idx >= 0) {
            const entry = flat[idx];
            const isDirty = dirtyFiles.current.has(entry.path) || dirtyContentCache.current.has(entry.path);
            const isActive = entry.path === activeFilePathRef.current;
            menuHighlightRef.current = 0;
            setMenuHLTick(0);
            showContextMenu(entry, isDirty, isActive, cols - 32, Math.min(2 + idx, rows - 12),
              vfs.current, clipboard, dirtyFiles, dirtyContentCache, fileLoadedContent,
              contentRef, setContent, setDirtyTick, addNotify, dismissNotify,
              () => { vfs.current.listDir('/').then(setFileTree); },
              (title, def, onConfirm) => { setPrompt({ title, defaultValue: def, onConfirm, onCancel: () => setPrompt(null) }); setPromptValue(def); },
              setActiveFilePath, setSidebarPath, showMenu, connectSSH);
          }
          return true;
        }
        if (handleSidebarKey(_input, key, fileTreeRef.current, sidebarPathRef.current, activeFilePathRef.current,
          setSidebarPath, setActiveFilePath, setContent, setCursor,
          setMode, modeRef, vfs.current, setFileTree, setTreeFocus,
          treeExpandedRef, setTreeExpanded, fileLoadedContent, dirtyFiles, dirtyContentCache,
          setDirtyTick, contentRef, addNotify, dismissNotify)) return true;
        // Mode transitions from sidebar (a → AUTO, v → VIM)
        if (mm.mode === 'normal' && mm.tryTransition(_input)) {
          setMode(mm.mode); setVimSub(mm.vimSubMode);
          setFocusTarget('editor'); setTreeFocus(false);
          if (mm.vimSubMode === 'visual' || mm.vimSubMode === 'visual-line' || mm.vimSubMode === 'visual-block') {
            visualAnchor.current = { ...cursorRef.current };
            if (mm.vimSubMode === 'visual-line') visualAnchor.current.col = 0;
          }
          return true;
        }
        return false;
      }

      // ── Editor focus (Auto / Vim mode) ─────────────────
      if (ft === 'editor') {
        if (mm.mode === 'normal') {
          // Shouldn't be here — focus=editor but mode=normal
          return false;
        }

        // AUTO mode editing
        if (mm.mode === 'auto') {
          setSelection(null);
          handleAutoMode(_input, key, contentStateRef.current, cursorRef.current, setContent, setCursor);
          return true;
        }

        // VIM mode editing (ESC already handled globally above)
        if (mm.mode === 'vim') {
          if (mm.tryTransition(_input)) {
            const prevSub = mm.vimSubMode;
            setMode(mm.mode); setVimSub(mm.vimSubMode);
            if ((mm.vimSubMode === 'visual' || mm.vimSubMode === 'visual-line' || mm.vimSubMode === 'visual-block') &&
                prevSub !== 'visual' && prevSub !== 'visual-line' && prevSub !== 'visual-block') {
              visualAnchor.current = { ...cursorRef.current };
              if (mm.vimSubMode === 'visual-line') visualAnchor.current.col = 0;
            }
            if (mm.vimSubMode === 'vim-normal' && (prevSub === 'visual' || prevSub === 'visual-line' || prevSub === 'visual-block')) {
              setSelection(null); visualAnchor.current = null;
            }
            if (mm.vimSubMode === 'vim-normal' && prevSub === 'insert') setSelection(null);
            return true;
          }
          switch (mm.vimSubMode) {
            case 'vim-normal': setSelection(null); handleVimNormal(_input, key, contentStateRef.current, cursorRef.current, setCursor, editorHeight, setScrollOffset); break;
            case 'insert': setSelection(null); handleInsert(_input, key, contentStateRef.current, cursorRef.current, setContent, setCursor); break;
            case 'visual': case 'visual-line': case 'visual-block': {
              const moved = moveCursorVisual(_input, key, contentStateRef.current, cursorRef.current, setCursor, editorHeight, setScrollOffset);
              if (moved && visualAnchor.current) {
                const endCol = mm.vimSubMode === 'visual-line' ? (contentStateRef.current[cursorRef.current.row]?.length ?? 0) : cursorRef.current.col;
                setSelection(normalizeSelection(visualAnchor.current, { row: cursorRef.current.row, col: endCol }));
              }
              break;
            }
            case 'command': break;
          }
          return true;
        }
        return false;
      }

      return false;
    });
  }, []); // ← only on mount, all dynamic values via refs

  // Menu handler — pushed when menu is open. Uses refs to avoid extra renders.
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  useEffect(() => {
    if (menu) {
      // Reset highlight (ref only — state already 0 from pre-render reset)
      menuHighlightRef.current = 0;
      inputStack.push('menu', (input: string, key: Key) => {
        // Only consume keys when menu is focused
        if (focusRef.current !== 'menu') return false;
        const m = menuRef.current;
        if (!m) return false;
        if (key.escape) { closeMenuRef.current(); return true; }
        if (key.upArrow) {
          menuHighlightRef.current = Math.max(0, menuHighlightRef.current - 1);
          setMenuHLTick((t) => t + 1);
          return true;
        }
        if (key.downArrow) {
          const max = (m.items.length || 1) - 1;
          menuHighlightRef.current = Math.min(max, menuHighlightRef.current + 1);
          setMenuHLTick((t) => t + 1);
          return true;
        }
        if (key.return) {
          const item = m.items[menuHighlightRef.current];
          if (item && !item.disabled) { item.action(); closeMenuRef.current(); }
          return true;
        }
        // Single-key direct access
        for (const item of m.items) {
          if (!item.disabled && (input === item.key || input === item.key.toUpperCase())) {
            item.action();
            closeMenuRef.current();
            return true;
          }
        }
        return true; // consume all other keys
      });
    } else {
      inputStack.pop('menu');
    }
  }, [menu]);

  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const promptValueRef = useRef(promptValue);
  promptValueRef.current = promptValue;

  // Prompt handler — pushed when prompt is active
  useEffect(() => {
    if (prompt) {
      inputStack.push('prompt', (input: string, key: Key) => {
        if (key.escape) { promptRef.current?.onCancel(); setPrompt(null); return true; }
        if (key.return) {
          const finalValue = promptValueRef.current.trim() || promptRef.current?.defaultValue || '';
          setPrompt(null);
          promptRef.current?.onConfirm(finalValue);
          return true;
        }
        if (key.backspace || key.delete) { setPromptValue((v) => v.slice(0, -1)); return true; }
        // Accept printable input (single char or paste). Filter escape sequences (start with ESC 0x1b).
        if (input && input.length >= 1 && input.charCodeAt(0) >= 0x20) {
          setPromptValue((v) => v + input);
        }
        return true;
      });
    } else {
      inputStack.pop('prompt');
    }
  }, [prompt]); // Only re-register when prompt appears/disappears

  const notifyCountRef = useRef(0);
  const prevNotifyCount = notifyCountRef.current;
  notifyCountRef.current = notifications.length;

  // Keep a ref to the latest notifications so the handler never goes stale
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  // Notification handler — pushed when notifications with actions exist
  useEffect(() => {
    const hasNotify = notifications.length > 0;
    const hadNotify = prevNotifyCount > 0;
    if (hasNotify && !hadNotify) {
      inputStack.push('notify', (input: string, key: Key) => {
        // Only consume keys when notify is focused
        if (focusRef.current !== 'notify') return false;
        // Read latest notifications from ref — avoids stale closure
        const all = notificationsRef.current;
        const latest = all[all.length - 1];
        if (!latest || latest.actions.length === 0) return false;
        // Esc → dismiss the latest actionable notification
        if (key.escape) {
          dismissNotify(latest.id);
          return true;
        }
        // Match action keys
        for (const action of latest.actions) {
          if (input === action.key || input === action.key.toUpperCase()) {
            action.onPress();
            return true;
          }
        }
        // Consume all keys — prevent accidental triggers while confirm is pending
        return true;
      });
    } else if (!hasNotify && hadNotify) {
      inputStack.pop('notify');
    }
  }, [notifications.length, prevNotifyCount]);

  // ── Notify auto-dismiss ───────────────────────────
  const notifyTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id));
    // Clear timers for removed notifications
    for (const [id, timer] of notifyTimersRef.current) {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        notifyTimersRef.current.delete(id);
      }
    }
    // Set timers for new notifications that have a timeout
    for (const n of notifications) {
      if (n.timeout && n.timeout > 0 && !notifyTimersRef.current.has(n.id)) {
        const timer = setTimeout(() => dismissNotify(n.id), n.timeout);
        notifyTimersRef.current.set(n.id, timer);
      }
    }
    // Cleanup on unmount
    return () => {
      for (const timer of notifyTimersRef.current.values()) clearTimeout(timer);
      notifyTimersRef.current.clear();
    };
  }, [notifications]);

  // ── Keyboard dispatch ────────────────────────────
  useInput((input, key) => {
    // SGR mouse — always checked first (raw VT sequences)
    if (input.startsWith('\x1b[<')) {
      const m = SGR_RE.exec(input);
      if (m) { const ev = parseSGRMouse(m); if (ev) setMouse(ev); }
      return;
    }

    // Dispatch to input stack (top-down)
    inputStack.dispatch(input, key as unknown as Key);
  });

  // Display
  const modeLabel = mode === 'vim'
    ? `VIM:${vimSub.toUpperCase().replace('VIM-NORMAL', 'NORMAL')}`
    : mode.toUpperCase();

  const sidebarWidth = Math.min(26, Math.floor(cols * 0.25));

  return (
    <InputContext.Provider value={{ mouse, consumeMouse, mode, vimSub, dispatchKey: () => {}, setMode }}>
      <Box flexDirection="column" width={cols} height={rows}>
        <Box flexDirection="row" width={cols} height={editorHeight}>
          {mode === 'normal' && (
            <Sidebar
              entries={[
                { name: '/ (workspace)', path: '/', isDirectory: true, children: fileTree } as FileEntry,
              ]}
              activePath={activeFilePath ?? undefined}
              selectedPath={sidebarPath}
              dirtyFiles={dirtyFiles.current}
              height={Math.max(1, editorHeight - 4)}
              expandedPaths={treeExpanded}
              onSelectFile={(entry) => {
                if (!entry.isDirectory) {
                  // If modifying same file, just return (avoid re-loading)
                  if (entry.path === activeFilePath) return;
                  // Cache dirty content before switching away
                  if (activeFilePath && dirtyFiles.current.has(activeFilePath)) {
                    dirtyContentCache.current.set(activeFilePath, contentRef.current.join('\n'));
                  }
                  // Check for cached dirty version first
                  const cached = dirtyContentCache.current.get(entry.path);
                  if (cached !== undefined) {
                    setContent(cached.split('\n'));
                    setActiveFilePath(entry.path);
                    // Keep VFS baseline for conflict detection
                    vfs.current.readFile(entry.path).then((text) => {
                      fileLoadedContent.current.set(entry.path, text);
                    });
                    setTreeFocus(false);
                    setCursor({ row: 0, col: 0 });
                    setScrollOffset(0);
                    if (modeRef.current.mode !== 'auto') {
                      modeRef.current.setMode('auto');
                      setMode('auto');
                    }
                  } else {
                    vfs.current.readFile(entry.path).then((text) => {
                      const lines = text.split('\n');
                      setContent(lines);
                      setActiveFilePath(entry.path);
                      fileLoadedContent.current.set(entry.path, text);
                      setTreeFocus(false);
                      setCursor({ row: 0, col: 0 });
                      setScrollOffset(0);
                      if (modeRef.current.mode !== 'auto') {
                        modeRef.current.setMode('auto');
                        setMode('auto');
                      }
                    });
                  }
                }
              }}
              width={sidebarWidth}
            />
          )}
          <Box flexDirection="column" flexGrow={1}>
            <EditorPane
              content={content}
              cursorRow={cursor.row}
              cursorCol={cursor.col}
              scrollOffset={scrollOffset}
              selection={selection}
              width={mode === 'normal' ? cols - sidebarWidth : cols}
              height={editorHeight}
            />
          </Box>
        </Box>
        <ContextMenu menu={menu} onClose={closeMenu} highlightIndex={menuHighlight} focused={focusTarget === 'menu'} />
        <NotifyStack items={notifications} rows={rows} cols={cols} focused={focusTarget === 'notify'} />
        {prompt && (
          <Box flexDirection="row" width={cols} paddingX={1}>
            <Text bold>{prompt.title}: </Text>
            <Text>{prompt.password ? '*'.repeat(promptValue.length) : promptValue}</Text>
            <Text dimColor>█</Text>
            <Box marginLeft={2}>
              <Text dimColor>Enter to confirm, Esc to cancel</Text>
            </Box>
          </Box>
        )}
        {showPalette && (
          <Box>
            <CommandPalette commands={[]} visible={showPalette}
              onExecute={() => setShowPalette(false)} onClose={() => setShowPalette(false)} />
          </Box>
        )}
        <StatusBar fileName="untitled" cursorLine={cursor.row + 1} cursorCol={cursor.col + 1}
          mode={modeLabel} cols={cols} focusTarget={focusTarget} />
      </Box>
    </InputContext.Provider>
  );
};

// ── AUTO mode ──────────────────────────────────────────

function handleAutoMode(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean;
         return: boolean; backspace: boolean; delete: boolean; },
  content: string[], cursor: { row: number; col: number },
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
): void {
  if (key.upArrow)    { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) })); return; }
  if (key.downArrow)  { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 1) })); return; }
  if (key.leftArrow)  { setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1) })); return; }
  if (key.rightArrow) { setCursor((c) => ({ ...c, col: Math.min(content[c.row]?.length ?? 0, c.col + 1) })); return; }
  if (input === '\x1b[H' || input === '\x1b[1~' || input === '\x1bOH') { setCursor((c) => ({ ...c, col: 0 })); return; }
  if (input === '\x1b[F' || input === '\x1b[4~' || input === '\x1bOF') { setCursor((c) => ({ ...c, col: content[c.row]?.length ?? 0 })); return; }
  if (input === '\x1b[5~') { setCursor((c) => ({ ...c, row: Math.max(0, c.row - 10) })); return; }
  if (input === '\x1b[6~') { setCursor((c) => ({ ...c, row: Math.min(content.length - 1, c.row + 10) })); return; }
  handleInsert(input, key, content, cursor, setContent, setCursor);
}

// ── VIM normal ─────────────────────────────────────────

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

// ── VIM visual — cursor movement with return value ─────

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
  // Scroll commands also update visual selection
  if (input === '\x15') { setScrollOffset((s) => Math.max(0, s - Math.floor(editorHeight / 2))); return true; }
  if (input === '\x04') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + Math.floor(editorHeight / 2))); return true; }
  if (input === '\x02') { setScrollOffset((s) => Math.max(0, s - editorHeight)); return true; }
  if (input === '\x06') { setScrollOffset((s) => Math.min(Math.max(0, content.length - editorHeight), s + editorHeight)); return true; }
  if (input === 'g') { setScrollOffset(0); setCursor((c) => ({ ...c, row: 0 })); return true; }
  if (input === 'G') { setScrollOffset(Math.max(0, content.length - editorHeight)); setCursor((c) => ({ ...c, row: content.length - 1 })); return true; }
  // w / b — word movement (single-step)
  if (input === 'w') {
    setCursor((c) => {
      const line = content[c.row];
      let col = c.col;
      // Skip to end of current word
      while (col < line.length && SYMBOL_RE.test(line[col])) col++;
      // Skip whitespace/non-symbol
      while (col < line.length && !SYMBOL_RE.test(line[col])) col++;
      return { ...c, col: Math.min(line.length, col) };
    });
    return true;
  }
  if (input === 'b') {
    setCursor((c) => {
      const line = content[c.row];
      let col = c.col - 1;
      if (col < 0) return { ...c, col: 0 };
      // Skip whitespace/non-symbol
      while (col > 0 && !SYMBOL_RE.test(line[col])) col--;
      // Skip to start of word
      while (col > 0 && SYMBOL_RE.test(line[col - 1])) col--;
      return { ...c, col };
    });
    return true;
  }
  return false;
}

// ── SGR mouse parser ───────────────────────────────────

function parseSGRMouse(m: RegExpExecArray): MouseEvent | null {
  const rawBtn = parseInt(m[1], 10);
  const col = parseInt(m[2], 10) - 1;
  const row = parseInt(m[3], 10) - 1;
  const isPress = m[4] === 'M';
  const modifiers = rawBtn & 28;
  if (rawBtn & 64) return { type: (rawBtn & 1) ? 'scroll-down' : 'scroll-up', button: 'none', col, row, modifiers };
  const button: MouseEvent['button'] = (rawBtn & 3) === 0 ? 'left' : (rawBtn & 3) === 1 ? 'middle' : (rawBtn & 3) === 2 ? 'right' : 'none';
  if (rawBtn & 32) return { type: 'move', button, col, row, modifiers };
  return { type: isPress ? 'press' : 'release', button, col, row, modifiers };
}

// ── Save handler ─────────────────────────────────────

function handleSave(
  filePath: string,
  content: string[],
  fileLoadedContent: React.MutableRefObject<Map<string, string>>,
  dirtyFiles: React.MutableRefObject<Set<string>>,
  dirtyContentCache: React.MutableRefObject<Map<string, string>>,
  vfs: IFileService,
  addNotify: (msg: string, actions: NotifyItem['actions'], timeout?: number) => number,
  dismissNotify: (id: number) => void,
  setDirtyTick: React.Dispatch<React.SetStateAction<number>>,
): void {
  const current = content.join('\n');
  const loaded = fileLoadedContent.current.get(filePath) ?? '';

  vfs.readFile(filePath).then((diskContent) => {
    // Conflict: disk content differs from what we loaded
    if (diskContent !== loaded) {
      const id = addNotify(`Conflict: ${filePath} changed on disk`, [
        { key: 'o', label: 'Override', onPress: () => {
          doSave(filePath, current, fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, setDirtyTick);
          dismissNotify(id);
        }},
        { key: 'c', label: 'Cancel', onPress: () => dismissNotify(id)},
      ], 30000);
      return;
    }
    // No conflict — save directly
    doSave(filePath, current, fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, setDirtyTick);
  }).catch(() => {
    // File doesn't exist yet — just write
    doSave(filePath, current, fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, setDirtyTick);
  });
}

function doSave(
  filePath: string, content: string,
  fileLoadedContent: React.MutableRefObject<Map<string, string>>,
  dirtyFiles: React.MutableRefObject<Set<string>>,
  dirtyContentCache: React.MutableRefObject<Map<string, string>>,
  vfs: IFileService,
  setDirtyTick: React.Dispatch<React.SetStateAction<number>>,
): void {
  vfs.writeFile(filePath, content).then(() => {
    fileLoadedContent.current.set(filePath, content);
    dirtyFiles.current.delete(filePath);
    dirtyContentCache.current.delete(filePath);
    setDirtyTick((t) => t + 1);
  });
}

// ── Context menu builder (reusable positioning) ──────

function showContextMenu(
  entry: FileEntry,
  isDirty: boolean,
  isActive: boolean,
  x: number, y: number,
  vfs: IFileService,
  clipboardRef: React.MutableRefObject<{ path: string; cut: boolean } | null>,
  dirtyFiles: React.MutableRefObject<Set<string>>,
  dirtyContentCache: React.MutableRefObject<Map<string, string>>,
  fileLoadedContent: React.MutableRefObject<Map<string, string>>,
  contentRef: React.MutableRefObject<string[]>,
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setDirtyTick: React.Dispatch<React.SetStateAction<number>>,
  addNotify: (msg: string, actions: NotifyItem['actions'], timeout?: number) => number,
  dismissNotify: (id: number) => void,
  refreshTree: () => void,
  openPrompt: (title: string, def: string, onConfirm: (v: string) => void) => void,
  setActiveFilePath: React.Dispatch<React.SetStateAction<string | null>>,
  setSidebarPath: React.Dispatch<React.SetStateAction<string>>,
  showMenu: (x: number, y: number, items: MenuItem[]) => void,
  onConnectSSH?: (connStr: string) => void,
): void {
  const parentDir = vfs.parentDir(entry.path);
  const isDir = entry.isDirectory;
  const hasClipboard = clipboardRef.current !== null;

  // Helper: discard changes
  const discardChanges = () => {
    if (isActive) {
      vfs.readFile(entry.path).then((text) => {
        setContent(text.split('\n'));
        fileLoadedContent.current.set(entry.path, text);
        dirtyFiles.current.delete(entry.path);
        dirtyContentCache.current.delete(entry.path);
        setDirtyTick((t) => t + 1);
      });
    } else {
      dirtyFiles.current.delete(entry.path);
      dirtyContentCache.current.delete(entry.path);
      setDirtyTick((t) => t + 1);
    }
  };

  const items: MenuItem[] = [
    // ── Open (files only)
    ...(isDir ? [] : [{
      key: 'o',
      label: isActive ? 'Open (already active)' : 'Open',
      action: () => {
        if (isActive) return;
        const cached = dirtyContentCache.current.get(entry.path);
        if (cached !== undefined) {
          setContent(cached.split('\n'));
          setActiveFilePath(entry.path);
          if (!fileLoadedContent.current.has(entry.path)) {
            vfs.readFile(entry.path).then((text: string) => {
              fileLoadedContent.current.set(entry.path, text);
            });
          }
        } else {
          vfs.readFile(entry.path).then((text) => {
            setContent(text.split('\n'));
            setActiveFilePath(entry.path);
            fileLoadedContent.current.set(entry.path, text);
            dirtyFiles.current.delete(entry.path);
            dirtyContentCache.current.delete(entry.path);
            setDirtyTick((t) => t + 1);
          });
        }
      },
      disabled: isActive,
    } as MenuItem]),

    // ── Save (files only, dirty only)
    ...(isDir ? [] : [{
      key: 's',
      label: 'Save',
      action: () => {
        const content = isActive ? contentRef.current : dirtyContentCache.current.get(entry.path)!.split('\n');
        handleSave(entry.path, content, fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, addNotify, dismissNotify, setDirtyTick);
      },
      disabled: !isDirty,
    } as MenuItem]),

    // ── Discard changes (files only, dirty only)
    ...(isDir ? [] : [{
      key: 'c',
      label: 'Discard Changes',
      action: () => {
        const sid = addNotify(`Discard changes to ${entry.name}?`, [
          { key: 'y', label: 'Continue', onPress: () => { dismissNotify(sid); discardChanges(); } },
          { key: 'n', label: 'Cancel', onPress: () => dismissNotify(sid) },
        ], 30000);
      },
      disabled: !isDirty,
    } as MenuItem]),

    // ── Separator (if we have file ops above)
    ...(isDir ? [] : [{ key: '─1', label: '──────────', action: () => {}, disabled: true } as MenuItem]),

    // ── Open Folder (directories only)
    ...(isDir ? [{
      key: 'w',
      label: 'Open Folder',
      action: () => {
        openPrompt('Open folder path', vfs.basePath, (folderPath) => {
          if (!folderPath) return;
          const resolved = pathResolve(folderPath);
          if (!existsSync(resolved)) {
            addNotify(`Folder not found: ${resolved}`, [], 5000);
            return;
          }
          if (!statSync(resolved).isDirectory()) {
            addNotify(`Not a directory: ${resolved}`, [], 5000);
            return;
          }
          // Clear editor state
          setActiveFilePath(null);
          setContent(['']);
          dirtyFiles.current.clear();
          dirtyContentCache.current.clear();
          fileLoadedContent.current.clear();
          setDirtyTick((t) => t + 1);
          // Switch workspace
          vfs.changeWorkspace(resolved);
          setSidebarPath('/');
          refreshTree();
          addNotify(`Workspace: ${resolved}`, [], 5000);
        });
      },
    } as MenuItem] : []),

    // ── SSH Connect (directories only)
    ...(isDir && onConnectSSH ? [{
      key: 'h',
      label: 'SSH Connect',
      action: () => {
        openPrompt('SSH (ssh user@host [-p port] [/path])', '', (connStr) => {
          if (!connStr) return;
          onConnectSSH(connStr);
        });
      },
    } as MenuItem] : []),

    // ── New File
    {
      key: 'f',
      label: 'New File',
      action: () => {
        openPrompt('New file name', '', (name) => {
          if (!name) return;
          const dir = isDir ? entry.path : parentDir;
          vfs.createFile(dir, name).then((newPath) => {
            refreshTree();
            setSidebarPath(newPath);
          });
        });
      },
    },

    // ── New Directory
    {
      key: 'd',
      label: 'New Directory',
      action: () => {
        openPrompt('New directory name', '', (name) => {
          if (!name) return;
          const dir = isDir ? entry.path : parentDir;
          vfs.createDirectory(dir, name).then(() => {
            refreshTree();
          });
        });
      },
    },

    // ── Separator
    { key: '─2', label: '──────────', action: () => {}, disabled: true },

    // ── Rename
    {
      key: 'r',
      label: 'Rename',
      action: () => {
        openPrompt('Rename', entry.name, (newName) => {
          if (!newName || newName === entry.name) return;
          vfs.rename(entry.path, newName).then((newPath) => {
            // Update active file path if the renamed file was active
            if (isActive) {
              setActiveFilePath(newPath);
              // Update tracking maps
              const oldLoaded = fileLoadedContent.current.get(entry.path);
              if (oldLoaded !== undefined) {
                fileLoadedContent.current.set(newPath, oldLoaded);
                fileLoadedContent.current.delete(entry.path);
              }
              if (dirtyFiles.current.has(entry.path)) {
                dirtyFiles.current.add(newPath);
                dirtyFiles.current.delete(entry.path);
              }
              const cached = dirtyContentCache.current.get(entry.path);
              if (cached !== undefined) {
                dirtyContentCache.current.set(newPath, cached);
                dirtyContentCache.current.delete(entry.path);
              }
            }
            refreshTree();
            setSidebarPath(newPath);
          });
        });
      },
    },

    // ── Delete
    {
      key: 'x',
      label: isDir ? 'Delete Directory' : 'Delete',
      disabled: entry.path === '/',
      action: () => {
        const sid = addNotify(`Delete ${entry.name}?`, [
          { key: 'y', label: 'Confirm', onPress: () => {
            dismissNotify(sid);
            vfs.delete(entry.path).then(() => {
              dirtyFiles.current.delete(entry.path);
              dirtyContentCache.current.delete(entry.path);
              fileLoadedContent.current.delete(entry.path);
              refreshTree();
              setSidebarPath(parentDir);
            }).catch(() => {
              addNotify(`Failed to delete ${entry.name}`, [], 5000);
            });
          }},
          { key: 'n', label: 'Cancel', onPress: () => dismissNotify(sid) },
        ], 30000);
      },
    },

    // ── Copy (files + directories)
    {
      key: 'y',
      label: 'Copy',
      action: () => {
        clipboardRef.current = { path: entry.path, cut: false };
        addNotify(`Copied: ${entry.name}`, [], 5000);
      },
    },

    // ── Cut (files + directories)
    {
      key: 't',
      label: 'Cut',
      action: () => {
        clipboardRef.current = { path: entry.path, cut: true };
        addNotify(`Cut: ${entry.name}`, [], 5000);
      },
    },

    // ── Paste (directories only — paste into the selected dir)
    {
      key: 'p',
      label: 'Paste',
      action: () => {
        if (!hasClipboard) return;
        const { path: srcPath, cut } = clipboardRef.current!;
        const srcName = vfs.baseName(srcPath);
        const destDir = isDir ? entry.path : parentDir;
        // Use copyEntry which handles both files and directories
        vfs.copyEntry(srcPath, destDir).then(async (destPath) => {
          if (cut) {
            await vfs.delete(srcPath);
            dirtyFiles.current.delete(srcPath);
            dirtyContentCache.current.delete(srcPath);
            fileLoadedContent.current.delete(srcPath);
            clipboardRef.current = null;
          }
          refreshTree();
          addNotify(cut ? `Moved: ${srcName}` : `Copied: ${srcName}`, [], 5000);
        }).catch(() => {
          addNotify(`Paste failed`, [], 5000);
        });
      },
      disabled: !hasClipboard || !isDir,
    },
  ];

  showMenu(x, y, items);
}

// ── Sidebar keyboard ──────────────────────────────────

function handleSidebarKey(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean;
         escape: boolean; return: boolean; },
  fileTree: FileEntry[],
  sidebarPath: string,
  activeFilePath: string | null,
  setSidebarPath: React.Dispatch<React.SetStateAction<string>>,
  setActiveFilePath: React.Dispatch<React.SetStateAction<string | null>>,
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>,
  modeRef: React.MutableRefObject<ModeManager>,
  vfs: IFileService,
  setFileTree: React.Dispatch<React.SetStateAction<FileEntry[]>>,
  setTreeFocus: React.Dispatch<React.SetStateAction<boolean>>,
  treeExpandedRef: React.MutableRefObject<Set<string>>,
  setTreeExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
  fileLoadedContent: React.MutableRefObject<Map<string, string>>,
  dirtyFiles: React.MutableRefObject<Set<string>>,
  dirtyContentCache: React.MutableRefObject<Map<string, string>>,
  setDirtyTick: React.Dispatch<React.SetStateAction<number>>,
  contentRef: React.MutableRefObject<string[]>,
  addNotify: (msg: string, actions: NotifyItem['actions'], timeout?: number) => number,
  dismissNotify: (id: number) => void,
): boolean {
  // Flatten visible tree entries (depth-first, only expanded dirs shown)
  const flat = flattenTreeWithRoot(fileTree, treeExpandedRef.current);

  // Find current index
  let idx = flat.findIndex((e) => e.path === sidebarPath);
  if (idx < 0) idx = 0;

  // Move selection
  if (key.upArrow    || input === 'k') {
    if (idx > 0) setSidebarPath(flat[idx - 1].path);
    return true;
  }
  if (key.downArrow  || input === 'j') {
    if (idx < flat.length - 1) setSidebarPath(flat[idx + 1].path);
    return true;
  }

  // Enter → open file or expand directory
  if (key.return) {
    const entry = flat[idx];
    if (!entry) return true;
    if (entry.isDirectory) {
      // Toggle expand
      setTreeExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
      // Refresh file tree from vfs
      vfs.listDir(entry.path).then((children) => {
        // Update the entry's children in place
        setFileTree((prev) => updateTreeChildren(prev, entry.path, children));
      });
      return true;
    }
    // If clicking same file, do nothing
    if (entry.path === activeFilePath) return true;
    // Cache dirty content before switching away from current file
    if (activeFilePath && dirtyFiles.current.has(activeFilePath)) {
      dirtyContentCache.current.set(activeFilePath, contentRef.current.join('\n'));
    }
    // Check for cached dirty version first
    const cached = dirtyContentCache.current.get(entry.path);
    if (cached !== undefined) {
      setContent(cached.split('\n'));
      setActiveFilePath(entry.path);
      if (!fileLoadedContent.current.has(entry.path)) {
        vfs.readFile(entry.path).then((text: string) => {
          fileLoadedContent.current.set(entry.path, text);
        });
      }
      setCursor({ row: 0, col: 0 });
      modeRef.current.setMode('auto');
      setMode('auto');
      setTreeFocus(false);
      return true;
    }
    // Open file — load content + track for conflict detection + switch to AUTO
    vfs.readFile(entry.path).then((text) => {
      const lines = text.split('\n');
      setContent(lines);
      setActiveFilePath(entry.path);
      fileLoadedContent.current.set(entry.path, text);
      // Remove from dirty (just loaded, matches disk)
      dirtyFiles.current.delete(entry.path);
      dirtyContentCache.current.delete(entry.path);
      setDirtyTick((t) => t + 1);
      setCursor({ row: 0, col: 0 });
      modeRef.current.setMode('auto');
      setMode('auto');
      setTreeFocus(false);
    });
    return true;
  }

  // S — save the highlighted file in sidebar
  if (input === 's' || input === 'S') {
    const entry = flat[idx];
    if (!entry || entry.isDirectory) return true;
    // If saving active file, use live content; otherwise use cached dirty content
    if (entry.path === activeFilePath) {
      handleSave(entry.path, contentRef.current, fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, addNotify, dismissNotify, setDirtyTick);
    } else if (dirtyContentCache.current.has(entry.path)) {
      const cached = dirtyContentCache.current.get(entry.path)!;
      handleSave(entry.path, cached.split('\n'), fileLoadedContent, dirtyFiles, dirtyContentCache, vfs, addNotify, dismissNotify, setDirtyTick);
    } else {
      const sid = addNotify(`${entry.name} — no changes to save`, [], 5000);
      setTimeout(() => dismissNotify(sid), 2000);
    }
    return true;
  }

  // E — open context menu for highlighted file (handled in useInput for closure access)

  // Tab — cycle to next dirty file
  if (input === '\t') {
    const dirtyEntries = flat.filter((e) => !e.isDirectory && dirtyFiles.current.has(e.path));
    if (dirtyEntries.length > 0) {
      let dirtyIdx = dirtyEntries.findIndex((e) => e.path === sidebarPath);
      dirtyIdx = (dirtyIdx + 1) % dirtyEntries.length;
      setSidebarPath(dirtyEntries[dirtyIdx].path);
    }
    return true;
  }

  return false;
}

/** Flatten tree respecting expanded directories. */
function flattenTree(entries: FileEntry[], expanded: Set<string>): FileEntry[] {
  const result: FileEntry[] = [];
  for (const e of entries) {
    result.push(e);
    if (e.children && expanded.has(e.path)) {
      result.push(...flattenTree(e.children, expanded));
    }
  }
  return result;
}

/** Flatten tree including a synthetic root entry at index 0. */
function flattenTreeWithRoot(entries: FileEntry[], expanded: Set<string>): FileEntry[] {
  const rootEntry: FileEntry = { name: '/ (workspace)', path: '/', isDirectory: true, children: entries };
  const flat: FileEntry[] = [rootEntry];
  if (expanded.has('/')) {
    flat.push(...flattenTree(entries, expanded));
  }
  return flat;
}

/** Update children of a specific directory entry in the tree. */
function updateTreeChildren(entries: FileEntry[], dirPath: string, children: FileEntry[]): FileEntry[] {
  return entries.map((e) => {
    if (e.path === dirPath) return { ...e, children };
    if (e.children) return { ...e, children: updateTreeChildren(e.children, dirPath, children) };
    return e;
  });
}

// ── INSERT mode ────────────────────────────────────────

function handleInsert(
  input: string,
  key: { return: boolean; backspace: boolean; delete: boolean },
  content: string[],
  cursor: { row: number; col: number },
  setContent: React.Dispatch<React.SetStateAction<string[]>>,
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>,
): void {
  setContent((prev) => {
    const lines = [...prev];
    const line = lines[cursor.row];
    if (line === undefined) return lines; // cursor out of sync

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
      // Handle multi-line paste (contains \n or \r\n)
      if (input.includes('\n') || input.includes('\r')) {
        const parts = input.split(/\r?\n/);
        lines[cursor.row] = line.slice(0, cursor.col) + parts[0];
        // Insert new lines for each subsequent part
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
}
