/**
 * Context menu builder — creates menu items for a file/directory entry.
 *
 * Uses DI services for state instead of React refs/setters. Called from
 * SidebarPanel when E key is pressed or when right-clicking a file.
 */
import type { FileEntry } from '../../types/index.js';
import type { MenuItem } from '../../services/menu/imenu-service.js';
import type { IEditorAPI } from '../../api/ieditor-api.js';
import { elog } from '../../util/error-log.js';

export function showContextMenu(
  entry: FileEntry,
  x: number,
  y: number,
  api: IEditorAPI,
): void {
  const fs = api.fs;
  const editor = api.editor;
  const workspace = api.workspace;
  const notify = api.notify;
  const prompt = api.prompt;
  const menu = api.menu;
  const clipboard = api.clipboard;

  const parentDir = fs.parentDir(entry.path);
  const isDir = entry.isDirectory;
  const isDirty = editor.isDirty(entry.path);
  const isActive = entry.path === editor.activePath;
  const hasClipboard = clipboard.hasContent;

  const items: MenuItem[] = [];

  // ── Open (files only) ──────────────────────────
  if (!isDir) {
    items.push({
      key: 'o', label: isActive ? 'Open (already active)' : 'Open',
      action: async () => {
        if (isActive) return;
        try {
          if (!(await fs.exists(entry.path))) {
            notify.add(`File not found: ${entry.name}`, [], 5000);
            return;
          }
          await api.openFile(entry.path);
        } catch (e: any) {
          elog(`ctxmenu open ${entry.path}: ${e.message}`);
          notify.add(`Cannot open: ${e.message}`, [], 5000);
        }
      },
      disabled: isActive,
    });
  }

  // ── Save (files only, dirty only) ──────────────
  if (!isDir && isDirty) {
    items.push({
      key: 's', label: 'Save',
      action: async () => {
        try { await api.saveFile(entry.path); }
        catch (e: any) {
          elog(`ctxmenu save ${entry.path}: ${e.message}`);
          notify.add(`Save failed: ${e.message}`, [], 5000);
        }
      },
    });
  }

  // ── Discard changes (files only, dirty only) ──
  if (!isDir && isDirty) {
    items.push({
      key: 'c', label: 'Discard Changes',
      action: async () => {
        const confirm = await prompt.open(`Discard changes to ${entry.name}? [y/N]`);
        if (confirm === null) return;
        editor.markClean(entry.path);
        if (isActive) {
          try {
            if (await fs.exists(entry.path)) {
              const text = await fs.readFile(entry.path);
              editor.setLoadedContent(entry.path, text);
            } else {
              notify.add(`File missing: ${entry.name} — discarding local changes only`, [], 5000);
            }
          } catch {
            notify.add(`Cannot reload: ${entry.name}`, [], 5000);
          }
        }
        notify.add(`Discarded: ${entry.name}`, [], 5000);
      },
    });
  }

  // Separator (if file ops above)
  if (!isDir) {
    items.push({ key: '-1', label: '──────────', action: () => {}, disabled: true });
  }

  // ── Open Folder (directories only) ─────────────
  if (isDir) {
    items.push({
      key: 'w', label: 'Open Folder',
      action: async () => {
        try {
          const folderPath = await prompt.open('Open folder path', { defaultValue: workspace.basePath });
          if (!folderPath) return;
          await api.openFolder(folderPath);
        } catch (e: any) {
          notify.add(`Open folder failed: ${e.message}`, [], 5000);
        }
      },
    });
  }

  // ── SSH Connect (directories only) ─────────────
  if (isDir) {
    items.push({
      key: 'h', label: 'SSH Connect',
      action: async () => {
        try {
          const connStr = await prompt.open('SSH (ssh user@host [-p port] [/path])', { defaultValue: '' });
          if (!connStr) return;
          await api.connectSSH(connStr);
        } catch (e: any) {
          notify.add(`SSH failed: ${e.message}`, [], 5000);
        }
      },
    });
  }

  // ── New File ────────────────────────────────────
  items.push({
    key: 'f', label: 'New File',
    action: async () => {
      try {
        const name = await prompt.open('New file name');
        if (!name) return;
        const dir = isDir ? entry.path : parentDir;
        if (!(await fs.exists(dir))) {
          notify.add(`Directory no longer exists`, [], 5000);
          return;
        }
        await fs.createFile(dir, name);
        await workspace.refreshTree();
        notify.add(`Created: ${name}`, [], 5000);
      } catch (e: any) {
        notify.add(`New file failed: ${e.message}`, [], 5000);
      }
    },
  });

  // ── New Directory ───────────────────────────────
  items.push({
    key: 'd', label: 'New Directory',
    action: async () => {
      try {
        const name = await prompt.open('New directory name');
        if (!name) return;
        const dir = isDir ? entry.path : parentDir;
        if (!(await fs.exists(dir))) {
          notify.add(`Directory no longer exists`, [], 5000);
          return;
        }
        await fs.createDirectory(dir, name);
        await workspace.refreshTree();
        notify.add(`Created: ${name}/`, [], 5000);
      } catch (e: any) {
        notify.add(`New directory failed: ${e.message}`, [], 5000);
      }
    },
  });

  // Separator
  items.push({ key: '-2', label: '──────────', action: () => {}, disabled: true });

  // ── Rename ──────────────────────────────────────
  items.push({
    key: 'r', label: 'Rename',
    action: async () => {
      try {
        if (!(await fs.exists(entry.path))) {
          notify.add(`File not found: ${entry.name}`, [], 5000);
          return;
        }
        const newName = await prompt.open('Rename', { defaultValue: entry.name });
        if (!newName || newName === entry.name) return;
        const newPath = await fs.rename(entry.path, newName);
        await workspace.refreshTree();
        workspace.setSidebarPath(newPath);
        notify.add(`Renamed: ${entry.name} → ${newName}`, [], 5000);
      } catch (e: any) {
        notify.add(`Rename failed: ${e.message}`, [], 5000);
      }
    },
  });

  // ── Delete ──────────────────────────────────────
  items.push({
    key: 'x', label: isDir ? 'Delete Directory' : 'Delete',
    disabled: entry.path === '/',
    action: async () => {
      const confirm = await prompt.open(`Delete ${entry.name}? [y/N]`);
      if (confirm === null) return;
      try {
        if (!(await fs.exists(entry.path))) {
          notify.add(`Already deleted: ${entry.name}`, [], 5000);
          await workspace.refreshTree();
          return;
        }
        await fs.delete(entry.path);
        editor.removeTracking(entry.path);
        await workspace.refreshTree();
        workspace.setSidebarPath(parentDir);
        notify.add(`Deleted: ${entry.name}`, [], 5000);
      } catch (e: any) {
        notify.add(`Delete failed: ${e.message}`, [], 5000);
      }
    },
  });

  // ── Copy ────────────────────────────────────
  items.push({
    key: 'y', label: 'Copy',
    action: () => {
      clipboard.copy(entry.path);
      notify.add(`Copied: ${entry.name}`, [], 5000);
    },
  });

  // ── Cut ─────────────────────────────────────
  items.push({
    key: 't', label: 'Cut',
    action: () => {
      clipboard.cut(entry.path);
      notify.add(`Cut: ${entry.name}`, [], 5000);
    },
  });

  // ── Paste (directories only) ────────────────
  items.push({
    key: 'p', label: 'Paste',
    disabled: !hasClipboard || !isDir,
    action: async () => {
      if (!hasClipboard) return;
      const clip = clipboard.entry!;
      const srcName = fs.baseName(clip.path);
      const destDir = isDir ? entry.path : parentDir;
      try {
        if (!(await fs.exists(clip.path))) {
          notify.add(`Source missing: ${srcName}`, [], 5000);
          clipboard.clear();
          return;
        }
        await fs.copyEntry(clip.path, destDir);
        if (clip.cut) {
          await fs.delete(clip.path);
          editor.removeTracking(clip.path);
          clipboard.clear();
        }
        await workspace.refreshTree();
        notify.add(clip.cut ? `Moved: ${srcName}` : `Copied: ${srcName}`, [], 5000);
      } catch (e: any) {
        notify.add(`Paste failed: ${e.message}`, [], 5000);
      }
    },
  });

  menu.show(x, y, items);
}
