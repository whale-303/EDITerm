import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useInput } from 'ink';
import { InputContext } from './hooks/input-context.js';
import type { Key } from './hooks/input-stack.js';
import { AppShell } from './panels/app-shell.js';
import { showContextMenu } from './panels/context-menu-builder.js';
import { useEditorAPI } from './hooks/use-service.js';
import { useService } from './hooks/use-service.js';
import { getService } from '../core/di/container.js';
import { TOKENS } from '../core/di/tokens.js';
import { registerAllCommands } from '../commands/index.js';
import { usePopupFocusManager } from './hooks/use-popup-focus-manager.js';
import type { ContributionHost } from '../core/contributions/contribution-host.js';
import type { IModeService } from '../core/interaction/mode-service.js';
import type { IFocusService } from '../services/focus/ifocus-service.js';
import type { IMenuService, MenuItem } from '../services/menu/imenu-service.js';
import type { INotifyService } from '../services/notify/inotify-service.js';
import type { IPromptService } from '../services/prompt/iprompt-service.js';
import type { IWorkspaceService } from '../services/workspace/iworkspace-service.js';
import type { ICompletionService } from '../services/completion/icompletion-service.js';
import type { FileEntry } from '../types/index.js';
import type { MouseEvent } from '../core/interaction/mouse-protocol.js';
import { elog } from '../util/error-log.js';
import type { IExtensionHost } from '../core/extensions/extension-host.js';
import { resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
// Ensure ContributionHost is registered before any service tries to access it
import '../core/contributions/contribution-host.js';

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

  // Sidebar scroll offset — updated by Sidebar via callback, used for menu Y positioning
  const sidebarScrollRef = useRef(0);

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
    '  F3      → Cycle Focus',
    '  F1      → Command Palette',
    '  Ctrl+P/Space → Completion (↑↓ select, Enter accept)',
  ]);
  const [cursor, setCursor] = useState({ row: 20, col: 2 });
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [showPalette, setShowPalette] = useState(false);

  // ── Mouse ─────────────────────────────────────
  const [mouse, setMouse] = useState<MouseEvent | null>(null);
  const consumeMouse = useCallback(() => setMouse(null), []);
  mouseSink.cb = (e: MouseEvent) => { setMouse(e); };

  const contentRef = useRef(content);
  contentRef.current = content;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // ── Resize ─────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      setRows(process.stdout.rows || 24);
      setCols(process.stdout.columns || 80);
    };
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // ── Raw stdin — F3 + Ctrl detection ────────────
  // Ink's useInput may not receive certain key combinations (F3, Ctrl+Space, Ctrl+P)
  // depending on terminal. Bypass it by reading raw stdin bytes.
  useEffect(() => {
    let buf = '';
    const handler = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buf += str;

      // ── Ctrl+Space (\x00) / Ctrl+P (\x10) → code completion ──
      let cIdx = 0;
      let hasCtrl = false;
      while (cIdx < buf.length) {
        const ch = buf[cIdx];
        if (ch === '\x00' || ch === '\x10') {
          hasCtrl = true;
          // Trigger completion only when editor is focused and no popup is open
          if (focusSvc.current === 'editor' && !completionSvc.isOpen) {
            const path = api.editor.activePath;
            if (path) {
              const line = contentRef.current[cursorRef.current.row] ?? '';
              const prefix = line.slice(0, cursorRef.current.col).match(/[a-zA-Z_]\w*$/)?.[0] ?? '';
              completionSvc.open(prefix, contentRef.current.join('\n'));
            }
          }
          // Remove the byte from buffer so it doesn't accumulate
          buf = buf.slice(0, cIdx) + buf.slice(cIdx + 1);
          continue;
        }
        cIdx++;
      }
      if (hasCtrl) buf = buf.replace(/[\x00\x10]/g, '');

      // ── F3 (\x1b[[C) → cycle focus ──────────────
      let idx = 0;
      while ((idx = buf.indexOf('\x1b[[C', idx)) !== -1) {
        process.stdout.write('\x07');
        focusSvc.cycle();
        idx += 4;
      }
      // ── F1 (\x1bOP / \x1b[11~) → toggle command palette ──
      if (buf.includes('\x1bOP') || buf.includes('\x1b[11~')) {
        setShowPalette((prev) => !prev);
        buf = buf.replace(/\x1bOP/g, '').replace(/\x1b\[11~/g, '');
      }
      // ── F4 → editor menu (only when editor focused) ──
      if (buf.includes('\x1b[[D') || buf.includes('\x1bOS') || buf.includes('\x1b[14~')) {
        if (focusSvc.current === 'editor') {
          const termCols = process.stdout.columns || 80;
          const sidebarW = modeSvc.mode === 'normal' ? Math.max(12, Math.floor(termCols * 0.22)) : 0;
          const editorW = sidebarW > 0 ? termCols - sidebarW : termCols;
          const lineLen = contentRef.current[cursorRef.current.row]?.length ?? 0;
          const clampedCol = Math.min(cursorRef.current.col, lineLen);
          // Visual column accounts for line wrapping within the editor pane
          const visualCol = clampedCol % editorW;
          const x = Math.min(sidebarW + visualCol + 8, termCols - 32);
          const y = Math.min(cursorRef.current.row - scrollOffsetRef.current, (process.stdout.rows || 24) - 12);
          const items: MenuItem[] = [
            { key: 'r', label: 'Return to files', action: () => { modeSvc.setMode('normal'); focusSvc.set('sidebar'); } },
          ];
          menuSvc.show(x, y, items);
        }
        buf = buf.replace(/\x1b\[\[D/g, '').replace(/\x1bOS/g, '').replace(/\x1b\[14~/g, '');
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
  const sidebarWidth = Math.min(32, Math.floor(cols * 0.3));

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
            showContextMenu(entry, menuXForEntry(entry, sidebarWidth, cols), Math.min(mouse.row, rows - 12), api);
          }
        }
      }
    }
    consumeMouse();
  }, [mouse, content.length, scrollOffset, editorHeight, consumeMouse, menuSvc, focusSvc, wsSvc.tree, wsSvc.expandedPaths, cols, rows, sidebarWidth, api]);

  // ── Keyboard dispatch ──────────────────────────
  const host = getService<ContributionHost>(TOKENS.ContributionHost);

  // ── Popup focus management (replaces 6 useLayoutEffect blocks) ──
  usePopupFocusManager(modeSvc.mode === 'normal' ? 'sidebar' : 'editor');

  // Sidebar navigation handler
  const sidebarPathRef = useRef(wsSvc.sidebarPath);
  sidebarPathRef.current = wsSvc.sidebarPath;
  const treeExpandedRef = useRef(wsSvc.expandedPaths);
  treeExpandedRef.current = wsSvc.expandedPaths;
  const treeRef = useRef(wsSvc.tree);
  treeRef.current = wsSvc.tree;

  useEffect(() => {
    host.inputHandlers.register({
      id: 'sidebar',
      priority: 10,
      when: 'focus==sidebar',
      handle(_input: string, key: Key) {
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
        if (entry) showContextMenu(entry, menuXForEntry(entry, sidebarWidth, cols), Math.min(2 + idx - sidebarScrollRef.current, rows - 12), api);
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
            (async () => {
              try {
                // Binary detection — prompt before potentially garbled read
                if (await api.fs.isProbablyBinary(entry.path)) {
                  const answer = await api.prompt.open(
                    'File appears to be binary. Open anyway? [y/N]',
                  );
                  if (answer === null || (answer !== 'y' && answer !== 'yes')) return;
                }
                const text = await api.fs.readFile(entry.path);
                setContent(text.split('\n'));
                api.editor.open(entry.path);
                api.editor.setLoadedContent(entry.path, text);
              } catch (e: any) {
                elog(`sidebar: readFile ${entry.path}: ${e.message}`);
                api.notify.add(`Cannot read: ${entry.name}`, [], 5000);
              }
            })();
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
      if (_input === '\t' || key.tab) {
        const dirtyEntries = flat.filter((e) => !e.isDirectory && api.editor.isDirty(e.path));
        if (dirtyEntries.length > 0) {
          let dirtyIdx = dirtyEntries.findIndex((e) => e.path === sidebarPathRef.current);
          dirtyIdx = (dirtyIdx + 1) % dirtyEntries.length;
          wsSvc.setSidebarPath(dirtyEntries[dirtyIdx].path);
        }
        return true;
      }
      return false;
      },
    });
  }, []); // stable — all dynamic values via refs

  // Menu handler — registered once, when-condition gates activation
  const menuCloseRef = useRef(() => menuSvc.close());
  menuCloseRef.current = () => menuSvc.close();

  useEffect(() => {
    host.inputHandlers.register({
      id: 'menu',
      priority: 50,
      when: 'focus==menu',
      handle(_input: string, key: Key) {
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
      },
    });
  }, []);

  // Notify handler — registered once, when-condition gates activation
  useEffect(() => {
    host.inputHandlers.register({
      id: 'notify',
      priority: 40,
      when: 'focus==notify',
      handle(_input: string, key: Key) {
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
      },
    });
  }, []);

  // Completion handler — registered once, when-condition gates activation
  useEffect(() => {
    host.inputHandlers.register({
      id: 'completion',
      priority: 40,
      when: 'completion.isOpen',
      handle(_input: string, key: Key) {
        if (key.escape) {
          completionSvc.close();
          return true;
        }
        if (key.upArrow) { completionSvc.moveSelection(-1); return true; }
        if (key.downArrow) { completionSvc.moveSelection(1); return true; }
        if (key.return || _input === '\r' || _input === '\t' || key.tab) {
          const text = completionSvc.accept();
          if (text) {
            // Use refs for latest cursor/content — the closure captures stale
            // state from when the popup first opened.
            const curCursor = cursorRef.current;
            const curLine = contentRef.current[curCursor.row] ?? '';
            // Find the word prefix to replace — backward from cursor
            let prefixStart = curCursor.col;
            while (prefixStart > 0 && /[a-zA-Z0-9_]/.test(curLine[prefixStart - 1])) {
              prefixStart--;
            }
            setContent((prev) => {
              const lines = [...prev];
              lines[curCursor.row] = curLine.slice(0, prefixStart) + text + curLine.slice(curCursor.col);
              return lines;
            });
            setCursor({ ...curCursor, col: prefixStart + text.length });
            // Mark dirty
            const path = api.editor.activePath;
            if (path) api.editor.markDirty(path, contentRef.current.join('\n'));
          }
          focusSvc.set('editor');
          return true;
        }
        // ── Let typing + editing pass through to the editor ──
        // Characters, backspace, delete, and arrow keys fall through
        // so the editor updates content/cursor, and the auto-trigger
        // re-filters the completion list on every keystroke.
        if (_input && _input.length === 1 && _input.charCodeAt(0) >= 0x20) return false;
        if (key.backspace || key.delete) return false;
        if (key.leftArrow || key.rightArrow) return false;
        return true; // eat everything else while completion is open
      },
    });
  }, []);

  // Prompt handler — registered once, when-condition gates activation
  const [promptValue, setPromptValue] = useState('');
  const [promptCursor, setPromptCursor] = useState(0);
  const promptValueRef = useRef(promptValue);
  promptValueRef.current = promptValue;
  const promptCursorRef = useRef(promptCursor);
  promptCursorRef.current = promptCursor;
  useEffect(() => {
    host.inputHandlers.register({
      id: 'prompt',
      priority: 60,
      when: 'focus==prompt',
      handle(_input: string, key: Key) {
        if (key.escape) { promptSvc.close(); return true; }
        if (key.return || _input === '\r') {

          const finalValue = promptValueRef.current.trim() || promptSvc.state?.defaultValue || '';
          promptSvc.confirm(finalValue);
          setPromptValue('');
          setPromptCursor(0);
          return true;
        }
        // ── Cursor movement ──────────────────────
        if (key.leftArrow) {
          setPromptCursor((c) => Math.max(0, c - 1));
          return true;
        }
        if (key.rightArrow) {
          setPromptCursor((c) => Math.min(promptValueRef.current.length, c + 1));
          return true;
        }
        if (_input === '\x1b[H' || _input === '\x1b[1~' || _input === '\x1bOH') {
          setPromptCursor(0);
          return true;
        }
        if (_input === '\x1b[F' || _input === '\x1b[4~' || _input === '\x1bOF') {
          setPromptCursor(promptValueRef.current.length);
          return true;
        }
        // ── Editing at cursor ────────────────────
        if (key.backspace) {
          setPromptValue((v) => {
            const c = promptCursorRef.current;
            if (c <= 0) return v;
            const newVal = v.slice(0, c - 1) + v.slice(c);
            setPromptCursor(Math.max(0, c - 1));
            return newVal;
          });
          return true;
        }
        if (key.delete) {
          setPromptValue((v) => {
            const c = promptCursorRef.current;
            if (c >= v.length) return v;
            return v.slice(0, c) + v.slice(c + 1);
          });
          return true;
        }
        if (_input && _input.length >= 1 && _input.charCodeAt(0) >= 0x20) {
          setPromptValue((v) => {
            const c = promptCursorRef.current;
            const newVal = v.slice(0, c) + _input + v.slice(c);
            setPromptCursor(c + _input.length);
            return newVal;
          });
        }
        return true;
      },
    });
  }, []);

  // Reset prompt cursor when default value is set on open
  useEffect(() => {
    if (promptSvc.isOpen) {
      const defVal = promptSvc.state?.defaultValue ?? '';
      setPromptCursor(defVal ? defVal.length : 0);
    }
  }, [promptSvc.isOpen]);

  // Mode transition handler — registered once, always active (no when)
  useEffect(() => {
    host.inputHandlers.register({
      id: 'mode-transition',
      priority: 5,
      handle(_input: string, key: Key) {
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
      },
    });
  }, []);

  // Register editor handler (from EditorPanel) — delegates to InputHandlerRegistry
  const registerHandler = useCallback((id: string, fn: (input: string, key: Key) => boolean) => {
    host.inputHandlers.register({
      id,
      priority: 10,
      when: 'focus==editor',
      handle(input: string, key: Key) { return fn(input, key); },
    });
  }, []);
  const unregisterHandler = useCallback((id: string) => {
    host.inputHandlers.unregister(id);
  }, []);

  // ── useInput dispatch ──────────────────────────
  useInput((input, key) => {
    // SGR mouse — always checked first
    if (input.startsWith('\x1b[<')) {
      const m = SGR_RE.exec(input);
      if (m) { const ev = parseSGRMouse(m); if (ev) setMouse(ev); }
      return;
    }
    // Dispatch via ContributionHost (priority-ordered, when-filtered)
    host.dispatchInput(input, key as unknown as Key);
  });

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
        onSidebarScroll={(o) => { sidebarScrollRef.current = o; }}
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
        promptCursor={promptCursor}
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

/** Compute tree depth from entry path: '/' → 0, '/e' → 1, '/e/Projects' → 2. */
function entryDepth(path: string): number {
  const cleaned = path.replace(/\/+$/, '');
  if (cleaned === '' || cleaned === '/') return 0;
  return cleaned.split('/').filter(Boolean).length;
}

/**
 * Compute context-menu x position: 2 columns right of the entry name.
 * Clamped to [sidebarWidth+1, cols-32] so it neither overlaps the sidebar
 * nor overflows the terminal.
 */
function menuXForEntry(entry: { name: string; path: string }, sidebarWidth: number, cols: number): number {
  const depth = entryDepth(entry.path);
  // indent(depth*2) + selectionArrow(2) + icon+spacing(3) + name.length + gap(2)
  const entryEndCol = 1 + depth * 2 + 2 + 3 + entry.name.length;
  const x = entryEndCol + 2;
  return Math.min(Math.max(x, sidebarWidth + 1), cols - 32);
}
