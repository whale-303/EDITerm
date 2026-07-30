import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useInput } from 'ink';
import { InputContext } from './hooks/input-context.js';
import { useInputStack } from './hooks/input-stack.js';
import type { Key } from './hooks/input-stack.js';
import { AppShell } from './panels/app-shell.js';
import { showContextMenu } from './panels/context-menu-builder.js';
import { useEditorAPI } from './hooks/use-service.js';
import { useService } from './hooks/use-service.js';
import { TOKENS } from '../core/di/tokens.js';
import { registerAllCommands } from '../commands/index.js';
import type { IModeService } from '../core/interaction/mode-service.js';
import type { IFocusService } from '../services/focus/ifocus-service.js';
import type { IMenuService } from '../services/menu/imenu-service.js';
import type { INotifyService } from '../services/notify/inotify-service.js';
import type { IPromptService } from '../services/prompt/iprompt-service.js';
import type { IWorkspaceService } from '../services/workspace/iworkspace-service.js';
import type { ICompletionService } from '../services/completion/icompletion-service.js';
import type { FileEntry } from '../types/index.js';
import type { MouseEvent } from '../core/interaction/mouse-protocol.js';
import { elog } from '../util/error-log.js';
import { getService } from '../core/di/container.js';
import type { IExtensionHost } from '../core/extensions/extension-host.js';
import { resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

// ── Constants ─────────────────────────────────────────

const SGR_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

// ── Selection type ────────────────────────────────────

export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface AppProps {
  mouseSink: { cb: ((e: MouseEvent) => void) | null };
}

// ── Component ─────────────────────────────────────────

export const App: React.FC<AppProps> = ({ mouseSink }) => {
  const [rows, setRows] = useState(process.stdout.rows || 24);
  const [cols, setCols] = useState(process.stdout.columns || 80);

  // ── Services ──────────────────────────────────
  const api = useEditorAPI();
  const modeSvc = useService<IModeService>(TOKENS.ModeService);
  const focusSvc = useService<IFocusService>(TOKENS.FocusService);
  const menuSvc = useService<IMenuService>(TOKENS.MenuService);
  const notifySvc = useService<INotifyService>(TOKENS.NotifyService);
  const promptSvc = useService<IPromptService>(TOKENS.PromptService);
  const wsSvc = useService<IWorkspaceService>(TOKENS.WorkspaceService);
  const completionSvc = useService<ICompletionService>(TOKENS.CompletionService);

  // ── Register commands ─────────────────────────
  useEffect(() => {
    registerAllCommands(api);
  }, [api]);

  // ── Load extensions ────────────────────────────
  useEffect(() => {
    const extHost = getService<IExtensionHost>(TOKENS.ExtensionHost);
    const extDir = resolve(process.cwd(), 'extensions');
    if (existsSync(extDir)) {
      const dirs = readdirSync(extDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const d of dirs) {
        extHost.load(resolve(extDir, d.name)).catch(e =>
          elog(`ext:${d.name}: ${e.message}`)
        );
      }
    }
  }, []);

  // ── Listen for file events → update React state ─
  useEffect(() => {
    const unsub = api.events.on('file:opened', ({ path }) => {
      api.fs.readFile(path).then((text) => {
        setContent(text.split('\n'));
      });
    });
    return unsub;
  }, [api]);

  // ── Editor state (React — tied to rendering) ──
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
  const [showPalette, setShowPalette] = useState(false);

  // ── Mouse ─────────────────────────────────────
  const [mouse, setMouse] = useState<MouseEvent | null>(null);
  const consumeMouse = useCallback(() => setMouse(null), []);
  mouseSink.cb = (e: MouseEvent) => { setMouse(e); };

  const contentRef = useRef(content);
  contentRef.current = content;

  // ── Resize ─────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      setRows(process.stdout.rows || 24);
      setCols(process.stdout.columns || 80);
    };
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // ── Raw stdin — F3 detection ──────────────────
  useEffect(() => {
    let buf = '';
    const handler = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buf += str;
      let idx = 0;
      while ((idx = buf.indexOf('\x1b[[C', idx)) !== -1) {
        process.stdout.write('\x07');
        focusSvc.cycle();
        idx += 4;
      }
      if (buf.length > 3) {
        const tail = buf.slice(-3);
        if (tail.startsWith('\x1b') || '\x1b[[C'.startsWith(tail)) buf = tail;
        else buf = '';
      }
    };
    process.stdin.on('data', handler);
    return () => { process.stdin.off('data', handler); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ────────────────────────────────
  const editorHeight = rows - 1;
  useEffect(() => {
    setScrollOffset((s) => {
      if (cursor.row < s) return cursor.row;
      if (cursor.row >= s + editorHeight) return cursor.row - editorHeight + 1;
      return s;
    });
  }, [cursor.row, editorHeight]);

  // ── Mouse → actions ───────────────────────────
  const sidebarWidth = Math.min(26, Math.floor(cols * 0.25));

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
      if (menuSvc.isOpen) { menuSvc.close(); consumeMouse(); return; }
      if (focusSvc.current === 'editor') {
        const editorCol = mouse.col - gutterWidth;
        if (editorCol >= 0) {
          setCursor({ row: Math.min(content.length - 1, scrollOffset + mouse.row), col: editorCol });
        }
      }
    }
    if (mouse.type === 'press' && mouse.button === 'right') {
      if (focusSvc.current === 'sidebar' && mouse.col < sidebarWidth) {
        const sidebarRow = mouse.row - 2;
        if (sidebarRow >= 0) {
          const flat = flattenTreeWithRoot(wsSvc.tree, new Set(wsSvc.expandedPaths));
          if (sidebarRow < flat.length) {
            const entry = flat[sidebarRow];
            showContextMenu(entry, Math.min(mouse.col, cols - 32), Math.min(mouse.row, rows - 12), api);
          }
        }
      }
    }
    consumeMouse();
  }, [mouse, content.length, scrollOffset, editorHeight, consumeMouse, menuSvc, focusSvc, wsSvc.tree, wsSvc.expandedPaths, cols, rows, sidebarWidth, api]);

  // ── Keyboard dispatch ──────────────────────────
  const inputStack = useInputStack();

  // Sidebar navigation handler
  const sidebarPathRef = useRef(wsSvc.sidebarPath);
  sidebarPathRef.current = wsSvc.sidebarPath;
  const treeExpandedRef = useRef(wsSvc.expandedPaths);
  treeExpandedRef.current = wsSvc.expandedPaths;
  const treeRef = useRef(wsSvc.tree);
  treeRef.current = wsSvc.tree;

  useEffect(() => {
    inputStack.push('sidebar', (_input: string, key: Key) => {
      if (focusSvc.current !== 'sidebar') return false;
      const flat = flattenTreeWithRoot(treeRef.current, new Set(treeExpandedRef.current));
      let idx = flat.findIndex((e) => e.path === sidebarPathRef.current);
      if (idx < 0) {
        // Current cursor path no longer exists (e.g. deleted) → reset to root
        idx = 0;
        wsSvc.setSidebarPath('/');
      }

      if (key.upArrow || _input === 'k') {
        if (idx > 0) wsSvc.setSidebarPath(flat[idx - 1].path);
        return true;
      }
      if (key.downArrow || _input === 'j') {
        if (idx < flat.length - 1) wsSvc.setSidebarPath(flat[idx + 1].path);
        return true;
      }
      if (_input === 'e' || _input === 'E') {
        const entry = flat[idx];
        if (entry) showContextMenu(entry, cols - 32, Math.min(2 + idx, rows - 12), api);
        return true;
      }
      // Enter → open file / toggle expand / switch to open file
      if (key.return || _input === '\r') {
        const entry = flat[idx];
        if (!entry) return true;
        if (entry.isDirectory) {
          wsSvc.toggleExpand(entry.path);
          // Children lazy-loaded by toggleExpand — no need for full refreshTree
        } else if (entry.path === api.editor.activePath) {
          // Already open — just switch to AUTO mode and focus editor
          modeSvc.setMode('auto');
          focusSvc.set('editor');
        } else {
          // Cache dirty content before switching
          if (api.editor.activePath && api.editor.isDirty(api.editor.activePath)) {
            api.editor.setDirtyCache(api.editor.activePath, contentRef.current.join('\n'));
          }
          const cached = api.editor.getDirtyCache(entry.path);
          if (cached !== undefined) {
            setContent(cached.split('\n'));
            api.editor.open(entry.path);
          } else {
            api.fs.readFile(entry.path).then((text) => {
              setContent(text.split('\n'));
              api.editor.open(entry.path);
              api.editor.setLoadedContent(entry.path, text);
            }).catch((e: any) => {
              elog(`sidebar: readFile ${entry.path}: ${e.message}`);
              api.notify.add(`Cannot read: ${entry.name}`, [], 5000);
              // File no longer exists — reset cursor to root
              wsSvc.setSidebarPath('/');
            });
          }
          modeSvc.setMode('auto');
          focusSvc.set('editor');
        }
        return true;
      }
      // S → save highlighted file
      if (_input === 's' || _input === 'S') {
        const entry = flat[idx];
        if (entry && !entry.isDirectory) {
          const current = entry.path === api.editor.activePath
            ? contentRef.current.join('\n')
            : api.editor.getDirtyCache(entry.path);
          if (current !== undefined) {
            api.fs.writeFile(entry.path, current).then(() => {
              api.editor.setLoadedContent(entry.path, current);
              api.editor.markClean(entry.path);
              api.notify.add(`Saved: ${entry.name}`, [], 5000);
            }).catch((e: any) => {
              elog(`sidebar: save ${entry.path}: ${e.message}`);
              api.notify.add(`Save failed: ${e.message}`, [], 5000);
            });
          } else {
            api.notify.add(`${entry.name} — no changes`, [], 5000);
          }
        }
        return true;
      }
      // Tab → cycle dirty files
      if (_input === '\t') {
        const dirtyEntries = flat.filter((e) => !e.isDirectory && api.editor.isDirty(e.path));
        if (dirtyEntries.length > 0) {
          let dirtyIdx = dirtyEntries.findIndex((e) => e.path === sidebarPathRef.current);
          dirtyIdx = (dirtyIdx + 1) % dirtyEntries.length;
          wsSvc.setSidebarPath(dirtyEntries[dirtyIdx].path);
        }
        return true;
      }
      return false;
    });
  }, []); // stable — all dynamic values via refs

  // Menu handler
  const menuCloseRef = useRef(() => menuSvc.close());
  menuCloseRef.current = () => menuSvc.close();

  useEffect(() => {
    if (menuSvc.isOpen) {
      inputStack.push('menu', (_input: string, key: Key) => {
        if (focusSvc.current !== 'menu') return false;
        if (key.escape) { menuCloseRef.current(); return true; }
        if (key.upArrow) { menuSvc.moveHighlight(-1); return true; }
        if (key.downArrow) { menuSvc.moveHighlight(1); return true; }
        if (key.return || _input === '\r') {
          const item = menuSvc.state?.items[menuSvc.highlightIndex];
          if (item && !item.disabled) { item.action(); menuSvc.close(); }
          return true;
        }
        // Single-key direct access
        for (const item of menuSvc.state?.items ?? []) {
          if (!item.disabled && (_input === item.key || _input === item.key.toUpperCase())) {
            item.action(); menuSvc.close(); return true;
          }
        }
        return true;
      });
    } else {
      inputStack.pop('menu');
    }
  }, [menuSvc.isOpen]);

  // Notify handler
  useEffect(() => {
    const hasNotify = notifySvc.hasActionable;
    if (hasNotify) {
      inputStack.push('notify', (_input: string, key: Key) => {
        if (focusSvc.current !== 'notify') return false;
        const items = notifySvc.items;
        const latest = items[items.length - 1];
        if (!latest || latest.actions.length === 0) return false;
        if (key.escape) { notifySvc.dismiss(latest.id); return true; }
        for (const action of latest.actions) {
          if (_input === action.key || _input === action.key.toUpperCase()) {
            action.onPress(); return true;
          }
        }
        return true;
      });
    } else {
      inputStack.pop('notify');
    }
  }, [notifySvc.hasActionable]);

  // Completion handler
  useEffect(() => {
    if (completionSvc.isOpen) {
      inputStack.push('completion', (_input: string, key: Key) => {
        if (key.escape) {
          completionSvc.close();
          focusSvc.set(modeSvc.mode === 'normal' ? 'sidebar' : 'editor');
          return true;
        }
        if (key.upArrow) { completionSvc.moveSelection(-1); return true; }
        if (key.downArrow) { completionSvc.moveSelection(1); return true; }
        if (key.return || _input === '\r' || _input === '\t') {
          const text = completionSvc.accept();
          if (text) {
            // Insert the accepted completion text
            setContent((prev) => {
              const lines = [...prev];
              const line = lines[cursor.row];
              // Find the prefix to replace — backward from cursor
              let prefixStart = cursor.col;
              while (prefixStart > 0 && /[a-zA-Z0-9_]/.test(line[prefixStart - 1])) {
                prefixStart--;
              }
              lines[cursor.row] = line.slice(0, prefixStart) + text + line.slice(cursor.col);
              return lines;
            });
            setCursor((c) => {
              const line = contentRef.current[c.row];
              let prefixStart = c.col;
              while (prefixStart > 0 && /[a-zA-Z0-9_]/.test(line[prefixStart - 1])) {
                prefixStart--;
              }
              return { ...c, col: prefixStart + text.length };
            });
            // Mark dirty
            const path = api.editor.activePath;
            if (path) api.editor.markDirty(path, contentRef.current.join('\n'));
          }
          focusSvc.set('editor');
          return true;
        }
        return true; // eat all other keys while completion is open
      });
    } else {
      inputStack.pop('completion');
    }
  }, [completionSvc.isOpen]);

  // Prompt handler
  const [promptValue, setPromptValue] = useState('');
  const promptValueRef = useRef(promptValue);
  promptValueRef.current = promptValue;
  useEffect(() => {
    if (promptSvc.isOpen) {
      inputStack.push('prompt', (_input: string, key: Key) => {
        if (key.escape) { promptSvc.close(); return true; }
        if (key.return || _input === '\r') {

          const finalValue = promptValueRef.current.trim() || promptSvc.state?.defaultValue || '';
          promptSvc.confirm(finalValue);
          setPromptValue('');
          return true;
        }
        if (key.backspace || key.delete) { setPromptValue((v) => v.slice(0, -1)); return true; }
        if (_input && _input.length >= 1 && _input.charCodeAt(0) >= 0x20) {
          setPromptValue((v) => v + _input);
        }
        return true;
      });
    } else {
      inputStack.pop('prompt');
    }
  }, [promptSvc.isOpen]);

  // Mode transition handler (a / v keys)
  useEffect(() => {
    inputStack.push('mode-transition', (_input: string, key: Key) => {
      if (key.escape) {
        if (showPalette) { setShowPalette(false); return true; }
        if (modeSvc.mode === 'normal') {
          modeSvc.setMode('auto'); focusSvc.set('editor');
        } else {
          modeSvc.setMode('normal'); focusSvc.set('sidebar');
          setSelection(null);
        }
        return true;
      }
      // In sidebar focus, allow mode transitions
      if (focusSvc.current === 'sidebar' && modeSvc.mode === 'normal') {
        if (modeSvc.tryTransition(_input)) {
          focusSvc.set('editor');
          return true;
        }
      }
      // In editor focus, allow vim sub-mode transitions
      if (focusSvc.current === 'editor' && modeSvc.mode === 'vim') {
        if (modeSvc.tryTransition(_input)) return true;
      }
      return false;
    });
  }, []);

  // Register editor handler (from EditorPanel)
  const registerHandler = useCallback((id: string, fn: (input: string, key: Key) => boolean) => {
    inputStack.push(id, fn);
  }, [inputStack]);
  const unregisterHandler = useCallback((id: string) => {
    inputStack.pop(id);
  }, [inputStack]);

  // ── useInput dispatch ──────────────────────────
  useInput((input, key) => {
    // SGR mouse — always checked first
    if (input.startsWith('\x1b[<')) {
      const m = SGR_RE.exec(input);
      if (m) { const ev = parseSGRMouse(m); if (ev) setMouse(ev); }
      return;
    }
    // Dispatch to input stack
    inputStack.dispatch(input, key as unknown as Key);
  });

  // ── Effects: focus sync ─────────────────────────

  // Auto-focus popups when they open
  useLayoutEffect(() => {
    if (menuSvc.isOpen) focusSvc.set('menu');
  }, [menuSvc.isOpen]);
  useLayoutEffect(() => {
    if (notifySvc.hasActionable) focusSvc.set('notify');
  }, [notifySvc.hasActionable]);
  useLayoutEffect(() => {
    if (promptSvc.isOpen) focusSvc.set('prompt');
  }, [promptSvc.isOpen]);

  // Restore focus when popups close — BUT only if no higher-priority popup is active.
  // Priority: prompt > notify > menu > sidebar/editor.
  // Without this check, menu close-restore can override prompt auto-focus
  // when a menu action opens a prompt.

  const prevMenuOpenRef = useRef(menuSvc.isOpen);
  useLayoutEffect(() => {
    const wasOpen = prevMenuOpenRef.current;
    const isOpen = menuSvc.isOpen;
    prevMenuOpenRef.current = isOpen;
    if (wasOpen && !isOpen && focusSvc.current === 'menu') {
      // Don't restore if a higher-priority popup is now open
      if (!promptSvc.isOpen && !notifySvc.hasActionable) {
        focusSvc.set(modeSvc.mode === 'normal' ? 'sidebar' : 'editor');
      }
    }
  }, [menuSvc.isOpen, modeSvc.mode]);

  const prevNotifyActionsRef = useRef(notifySvc.hasActionable);
  useLayoutEffect(() => {
    const hadActions = prevNotifyActionsRef.current;
    const hasActions = notifySvc.hasActionable;
    prevNotifyActionsRef.current = hasActions;
    if (hadActions && !hasActions && focusSvc.current === 'notify') {
      if (!promptSvc.isOpen) {
        focusSvc.set(modeSvc.mode === 'normal' ? 'sidebar' : 'editor');
      }
    }
  }, [notifySvc.hasActionable, modeSvc.mode]);

  const prevPromptOpenRef = useRef(promptSvc.isOpen);
  useLayoutEffect(() => {
    const wasOpen = prevPromptOpenRef.current;
    const isOpen = promptSvc.isOpen;
    prevPromptOpenRef.current = isOpen;
    if (wasOpen && !isOpen && focusSvc.current === 'prompt') {
      focusSvc.set(modeSvc.mode === 'normal' ? 'sidebar' : 'editor');
    }
  }, [promptSvc.isOpen, modeSvc.mode]);

  // Mode label for rendering
  const mode = modeSvc.mode;

  // ── Render ─────────────────────────────────────
  return (
    <InputContext.Provider value={{
      mouse, consumeMouse,
      mode: modeSvc.mode,
      vimSub: modeSvc.vimSubMode,
      dispatchKey: () => {},
      setMode: (m) => modeSvc.setMode(m),
    }}>
      <AppShell
        cols={cols}
        rows={rows}
        mode={mode}
        sidebarWidth={sidebarWidth}
        editorHeight={editorHeight}
        content={content}
        setContent={setContent}
        cursor={cursor}
        setCursor={setCursor}
        scrollOffset={scrollOffset}
        setScrollOffset={setScrollOffset}
        selection={selection}
        setSelection={setSelection}
        showPalette={showPalette}
        onClosePalette={() => setShowPalette(false)}
        promptValue={promptValue}
        onRegisterHandler={registerHandler}
        onUnregisterHandler={unregisterHandler}
      />
    </InputContext.Provider>
  );
};

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

// ── Tree helpers ────────────────────────────────────────

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

function flattenTreeWithRoot(entries: FileEntry[], expanded: Set<string>): FileEntry[] {
  const rootEntry: FileEntry = { name: '/ (workspace)', path: '/', isDirectory: true, children: entries };
  const flat: FileEntry[] = [rootEntry];
  if (expanded.has('/')) {
    flat.push(...flattenTree(entries, expanded));
  }
  return flat;
}
