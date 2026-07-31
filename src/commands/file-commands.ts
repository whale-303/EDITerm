/**
 * File operation commands — open, save, delete, rename, new file/dir, etc.
 */
import type { IEditorAPI } from '../api/ieditor-api.js';

export function registerFileCommands(api: IEditorAPI): void {
  // ── Save ────────────────────────────────────────
  api.commands.register({
    id: 'file.save',
    label: 'Save File',
    keybinding: 's',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.editor.activePath;
      if (!path) return;
      await api.saveFile(path);
    },
  });

  // ── Delete ──────────────────────────────────────
  api.commands.register({
    id: 'file.delete',
    label: 'Delete File',
    keybinding: 'x',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      if (!path || path === '/') return;
      await api.deleteFile(path);
    },
  });

  // ── New File ────────────────────────────────────
  api.commands.register({
    id: 'file.newFile',
    label: 'New File',
    keybinding: 'f',
    when: 'focus==sidebar',
    run: async () => {
      const name = await api.prompt.open('New file name');
      if (!name) return;
      const isDir = await api.fs.isDirectory(api.workspace.sidebarPath);
      const dir = isDir ? api.workspace.sidebarPath : api.fs.parentDir(api.workspace.sidebarPath);
      const newPath = await api.fs.createFile(dir, name);
      await api.workspace.refreshTree();
      api.workspace.setSidebarPath(newPath);
      api.notify.add(`Created: ${name}`, [], 5000);
    },
  });

  // ── New Directory ───────────────────────────────
  api.commands.register({
    id: 'file.newDir',
    label: 'New Directory',
    keybinding: 'd',
    when: 'focus==sidebar',
    run: async () => {
      const name = await api.prompt.open('New directory name');
      if (!name) return;
      const isDir = await api.fs.isDirectory(api.workspace.sidebarPath);
      const dir = isDir ? api.workspace.sidebarPath : api.fs.parentDir(api.workspace.sidebarPath);
      await api.fs.createDirectory(dir, name);
      await api.workspace.refreshTree();
      api.notify.add(`Created: ${name}/`, [], 5000);
    },
  });

  // ── Rename ──────────────────────────────────────
  api.commands.register({
    id: 'file.rename',
    label: 'Rename',
    keybinding: 'r',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      const oldName = api.fs.baseName(path);
      const newName = await api.prompt.open('Rename', { defaultValue: oldName });
      if (!newName || newName === oldName) return;
      const newPath = await api.fs.rename(path, newName);
      await api.workspace.refreshTree();
      api.workspace.setSidebarPath(newPath);
      api.events.emit('file:renamed', { oldPath: path, newPath });
    },
  });

  // ── Copy ────────────────────────────────────────
  api.commands.register({
    id: 'file.copy',
    label: 'Copy',
    keybinding: 'y',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      api.clipboard.copy(path);
      api.notify.add(`Copied: ${api.fs.baseName(path)}`, [], 5000);
    },
  });

  // ── Cut ─────────────────────────────────────────
  api.commands.register({
    id: 'file.cut',
    label: 'Cut',
    keybinding: 't',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      api.clipboard.cut(path);
      api.notify.add(`Cut: ${api.fs.baseName(path)}`, [], 5000);
    },
  });

  // ── Paste ───────────────────────────────────────
  api.commands.register({
    id: 'file.paste',
    label: 'Paste',
    keybinding: 'p',
    when: 'focus==sidebar && clipboard.hasContent',
    run: async () => {
      const clip = api.clipboard.entry;
      if (!clip) return;
      const srcName = api.fs.baseName(clip.path);
      const isDir = await api.fs.isDirectory(api.workspace.sidebarPath);
      const destDir = isDir ? api.workspace.sidebarPath : api.fs.parentDir(api.workspace.sidebarPath);
      try {
        await api.fs.copyEntry(clip.path, destDir);
        if (clip.cut) {
          await api.fs.delete(clip.path);
          api.editor.removeTracking(clip.path);
          api.clipboard.clear();
        }
        await api.workspace.refreshTree();
        api.notify.add(clip.cut ? `Moved: ${srcName}` : `Copied: ${srcName}`, [], 5000);
      } catch {
        api.notify.add('Paste failed', [], 5000);
      }
    },
  });

  // ── Open File ───────────────────────────────────
  api.commands.register({
    id: 'file.open',
    label: 'Open File',
    keybinding: 'enter',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      const isDir = await api.fs.isDirectory(path);
      if (isDir) {
        // Toggle expand — loads children on first expand (no need for full refreshTree)
        api.workspace.toggleExpand(path);
      } else {
        await api.openFile(path);
      }
    },
  });

  // ── Discard Changes ─────────────────────────────
  api.commands.register({
    id: 'file.discardChanges',
    label: 'Discard Changes',
    keybinding: 'c',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      if (!api.editor.isDirty(path)) return;
      const confirmed = await api.prompt.open(`Discard changes to ${api.fs.baseName(path)}? [y/N]`);
      if (confirmed === null) return;
      api.editor.markClean(path);
      // Re-read from disk if this is the active file
      if (path === api.editor.activePath) {
        const text = await api.fs.readFile(path);
        api.editor.setLoadedContent(path, text);
      }
      api.notify.add(`Discarded: ${api.fs.baseName(path)}`, [], 5000);
    },
  });
}
