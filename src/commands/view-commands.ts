/**
 * View / navigation commands — focus cycling, command palette, mode switching.
 */
import type { IEditorAPI } from '../api/ieditor-api.js';

export function registerViewCommands(api: IEditorAPI): void {
  // ── Cycle Focus (F3) ───────────────────────────
  api.commands.register({
    id: 'view.cycleFocus',
    label: 'Cycle Focus',
    keybinding: '\x1b[[C',          // F3 raw sequence
    when: 'global',
    run: () => {
      api.focus.cycle();
    },
  });

  // ── Toggle Sidebar ↔ Editor (Ctrl+B) ───────────
  api.commands.register({
    id: 'view.toggleFocus',
    label: 'Toggle Sidebar/Editor',
    keybinding: '\x02',             // Ctrl+B
    when: 'global',
    run: () => {
      if (api.focus.current === 'editor') {
        api.focus.set('sidebar');
        api.mode.setMode('normal');
      } else if (api.focus.current === 'sidebar') {
        api.focus.set('editor');
        api.mode.setMode('auto');
      }
    },
  });

  // ── Command Palette (Ctrl+P) ───────────────────
  api.commands.register({
    id: 'view.commandPalette',
    label: 'Command Palette',
    keybinding: '\x10',             // Ctrl+P
    when: 'global',
    run: () => {
      // toggle — handled by UI state in Phase 4
      api.events.emit('before:quit', undefined); // placeholder
    },
  });

  // ── Escape — Toggle Normal ↔ Auto ──────────────
  api.commands.register({
    id: 'view.escape',
    label: 'Toggle Normal/Auto',
    keybinding: 'escape',           // special: matched by Key.escape
    when: 'global',
    run: () => {
      if (api.mode.mode === 'normal') {
        api.mode.setMode('auto');
        api.focus.set('editor');
      } else {
        api.mode.setMode('normal');
        api.focus.set('sidebar');
      }
    },
  });

  // ── Tab — Cycle dirty files ────────────────────
  api.commands.register({
    id: 'view.nextDirty',
    label: 'Next Dirty File',
    keybinding: '\t',               // Tab
    when: 'focus==sidebar',
    run: () => {
      // Logic: find next dirty file in the tree
      // This needs tree flattening which is a UI concern — for now, placeholder
      api.events.emit('before:quit', undefined);
    },
  });
}
