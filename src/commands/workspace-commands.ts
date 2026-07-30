/**
 * Workspace commands — open folder, SSH connect, refresh tree.
 */
import type { IEditorAPI } from '../api/ieditor-api.js';

export function registerWorkspaceCommands(api: IEditorAPI): void {
  // ── Open Folder ─────────────────────────────────
  api.commands.register({
    id: 'workspace.openFolder',
    label: 'Open Folder',
    keybinding: 'w',
    when: 'focus==sidebar && sidebarPath==/',
    run: async () => {
      const folderPath = await api.prompt.open('Open folder path', {
        defaultValue: api.workspace.basePath,
      });
      if (!folderPath) return;
      await api.openFolder(folderPath);
    },
  });

  // ── SSH Connect ─────────────────────────────────
  api.commands.register({
    id: 'workspace.connectSSH',
    label: 'SSH Connect',
    keybinding: 'h',
    when: 'focus==sidebar && sidebarPath==/',
    run: async () => {
      const connStr = await api.prompt.open(
        'SSH (ssh user@host [-p port] [/path])',
        { defaultValue: '' },
      );
      if (!connStr) return;
      await api.connectSSH(connStr);
    },
  });

  // ── Refresh Tree ────────────────────────────────
  api.commands.register({
    id: 'workspace.refresh',
    label: 'Refresh File Tree',
    keybinding: 'R',
    when: 'focus==sidebar',
    run: async () => {
      await api.workspace.refreshTree();
      api.notify.add('File tree refreshed', [], 5000);
    },
  });

  // ── Context Menu (E) ────────────────────────────
  // The E key in sidebar opens context menu. This is a UI action that
  // triggers the MenuService — registered as a command for extensibility.
  api.commands.register({
    id: 'view.contextMenu',
    label: 'Context Menu',
    keybinding: 'e',
    when: 'focus==sidebar',
    run: async () => {
      // Context menu building is a UI concern (needs dirty state, etc.)
      // Emit event so UI layer can handle it.
      api.events.emit('before:quit', undefined); // placeholder — wired in Phase 4
    },
  });
}
