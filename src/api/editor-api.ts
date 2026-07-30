/**
 * EditorAPI — central API facade that aggregates all services.
 *
 * This is the single entry point for UI components and extensions.
 * Registered as DI singleton via TOKENS.EditorAPI.
 */
import { register, getService } from '../core/di/container.js';
import { TOKENS } from '../core/di/tokens.js';
import type { IEditorAPI } from './ieditor-api.js';
import type { IFileService } from '../services/file/ifile-service.js';
import type { ICommandRegistry } from '../core/commands/command-registry.js';
import type { IEventBus } from '../core/events/event-bus.js';
import type { IModeService } from '../core/interaction/mode-service.js';
import type { IEditorService } from '../core/editor/editor-service.js';
import type { IWorkspaceService } from '../services/workspace/iworkspace-service.js';
import type { INotifyService } from '../services/notify/inotify-service.js';
import type { IPromptService } from '../services/prompt/iprompt-service.js';
import type { IMenuService } from '../services/menu/imenu-service.js';
import type { IFocusService } from '../services/focus/ifocus-service.js';
import type { IClipboardService } from '../services/clipboard/iclipboard-service.js';
import type { ILayoutManager } from '../core/layout/layout-manager.js';
import { SSHFileService } from '../services/file/ssh-service.js';
import { existsSync, statSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

// Re-export for convenience
export type { IEditorAPI } from './ieditor-api.js';

register(TOKENS.EditorAPI, () => new EditorAPI());

export class EditorAPI implements IEditorAPI {
  // ── Sub-services (lazy via getters) ──────────

  get fs(): IFileService          { return this._workspace.vfs; }
  get commands(): ICommandRegistry { return getService<ICommandRegistry>(TOKENS.CommandRegistry); }
  get events(): IEventBus          { return getService<IEventBus>(TOKENS.EventBus); }
  get mode(): IModeService         { return getService<IModeService>(TOKENS.ModeService); }
  get editor(): IEditorService     { return getService<IEditorService>(TOKENS.EditorService); }
  get workspace(): IWorkspaceService { return this._workspace; }
  get notify(): INotifyService     { return getService<INotifyService>(TOKENS.NotifyService); }
  get prompt(): IPromptService     { return getService<IPromptService>(TOKENS.PromptService); }
  get menu(): IMenuService         { return getService<IMenuService>(TOKENS.MenuService); }
  get focus(): IFocusService       { return getService<IFocusService>(TOKENS.FocusService); }
  get clipboard(): IClipboardService { return getService<IClipboardService>(TOKENS.ClipboardService); }
  get layout(): ILayoutManager     { return getService<ILayoutManager>(TOKENS.LayoutManager); }

  private _workspace: IWorkspaceService;

  constructor() {
    this._workspace = getService<IWorkspaceService>(TOKENS.WorkspaceService);
  }

  // ── File operations ─────────────────────────

  async openFile(path: string): Promise<void> {
    // Cache dirty content of currently active file
    const activePath = this.editor.activePath;
    if (activePath && activePath !== path && this.editor.isDirty(activePath)) {
      // Caller (UI) is responsible for providing current content.
      // The dirty cache is already set by the UI before switching.
    }

    // Check for cached dirty version
    const cached = this.editor.getDirtyCache(path);
    if (cached !== undefined) {
      await this.editor.open(path);
    } else {
      const text = await this.fs.readFile(path);
      this.editor.setLoadedContent(path, text);
      await this.editor.open(path);
    }

    this.mode.setMode('auto');
    this.focus.set('editor');
    this.events.emit('file:opened', { path });
  }

  async saveFile(path?: string): Promise<void> {
    const target = path ?? this.editor.activePath;
    if (!target) {
      this.notify.add('No file to save', [], 5000);
      return;
    }

    const loaded = this.editor.getLoadedContent(target) ?? '';

    // Check for disk conflict
    try {
      const diskContent = await this.fs.readFile(target);
      if (diskContent !== loaded) {
        const confirmed = await this.prompt.open(
          `Conflict: ${target} changed on disk. Overwrite?`,
          { defaultValue: 'y' },
        );
        if (confirmed === null) return; // cancelled
      }
    } catch {
      // File doesn't exist yet — fine
    }

    // The actual content is provided by the UI via setLoadedContent
    // This method primarily handles the orchestration: conflict check, clean marking
    this.editor.markClean(target);
    this.notify.add(`Saved: ${target}`, [], 5000);
    this.events.emit('file:saved', { path: target });
  }

  closeFile(path: string): void {
    this.editor.close(path);
  }

  async deleteFile(path: string): Promise<boolean> {
    const name = this.fs.baseName(path);
    const confirmed = await this.prompt.open(
      `Delete ${name}? [y/N]`,
      { defaultValue: '' },
    );
    if (confirmed === null) return false;

    await this.fs.delete(path);
    this.editor.removeTracking(path);
    await this.workspace.refreshTree();
    this.notify.add(`Deleted: ${name}`, [], 5000);
    this.events.emit('file:deleted', { path });
    return true;
  }

  // ── Workspace ───────────────────────────────

  async connectSSH(connStr: string): Promise<void> {
    // Parse: ssh user@host [-p port] [/path]
    const trimmed = connStr.trim();
    let rest = trimmed.startsWith('ssh ') ? trimmed.slice(4).trim() : trimmed;
    let port = 22;
    let remoteRoot = '/';

    const portMatch = rest.match(/^(.*?)\s+-p\s+(\d+)(?:\s+(.*))?$/);
    if (portMatch) {
      rest = portMatch[1];
      port = parseInt(portMatch[2], 10);
      if (portMatch[3]) remoteRoot = portMatch[3];
    } else {
      const pathMatch = rest.match(/^(\S+)\s+(.+)$/);
      if (pathMatch) {
        rest = pathMatch[1];
        remoteRoot = pathMatch[2];
      }
    }

    const host = rest;
    if (!host || !host.includes('@')) {
      this.notify.add('Format: ssh user@host [-p port] [/path]', [], 5000);
      return;
    }

    const password = await this.prompt.open(
      `Password for ${host}`,
      { password: true },
    );
    if (password === null) return; // cancelled

    try {
      await this.workspace.connectSSH({ host, port, remoteRoot, password });
      this.notify.add(`Connected: ${this.workspace.basePath}`, [], 5000);
    } catch (e: any) {
      this.notify.add(`SSH failed: ${e.message}`, [], 5000);
    }
  }

  async openFolder(dirPath: string): Promise<void> {
    const resolved = pathResolve(dirPath);
    if (!existsSync(resolved)) {
      this.notify.add(`Folder not found: ${resolved}`, [], 5000);
      return;
    }
    if (!statSync(resolved).isDirectory()) {
      this.notify.add(`Not a directory: ${resolved}`, [], 5000);
      return;
    }
    await this.workspace.switchLocal(resolved);
    this.notify.add(`Workspace: ${resolved}`, [], 5000);
  }

  // ── Lifecycle ───────────────────────────────

  async bootstrap(): Promise<void> {
    await this.workspace.refreshTree();
  }

  dispose(): void {
    this.workspace.disconnect();
  }
}
