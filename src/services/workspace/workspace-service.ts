/**
 * WorkspaceService — manages the current file workspace (local or remote).
 *
 * Wraps IFileService, maintains file tree + sidebar state, and handles
 * workspace switching (local folder open, SSH connect/disconnect).
 *
 * Registered as DI singleton via TOKENS.WorkspaceService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import { WorkspaceFileService } from '../file/workspace-service.js';
import { SSHFileService } from '../file/ssh-service.js';
import type { SSHConfig } from '../file/ssh-service.js';
import type { IFileService } from '../file/ifile-service.js';
import type { FileEntry } from '../../types/index.js';
import type { IWorkspaceService } from './iworkspace-service.js';
import type { IEventBus } from '../../core/events/event-bus.js';

const DEFAULT_WORKSPACE = './test_workspace';

export class WorkspaceService implements IWorkspaceService {
  private _vfs: IFileService;
  private _tree: FileEntry[] = [];
  private _sidebarPath = '/';
  private _expanded = new Set<string>(['/']);
  private _listeners = new Set<() => void>();

  constructor() {
    this._vfs = new WorkspaceFileService(DEFAULT_WORKSPACE);
  }

  // ── Accessors ─────────────────────────────────────

  get vfs(): IFileService {
    return this._vfs;
  }

  get isRemote(): boolean {
    return this._vfs instanceof SSHFileService;
  }

  get basePath(): string {
    return this._vfs.basePath;
  }

  get tree(): FileEntry[] {
    return this._tree;
  }

  get sidebarPath(): string {
    return this._sidebarPath;
  }

  get expandedPaths(): ReadonlySet<string> {
    return this._expanded;
  }

  // ── Tree / sidebar ────────────────────────────────

  setSidebarPath(path: string): void {
    if (this._sidebarPath === path) return;
    this._sidebarPath = path;
    this._notify();
  }

  toggleExpand(path: string): boolean {
    const next = new Set(this._expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    this._expanded = next;
    this._notify();
    return next.has(path);
  }

  async refreshTree(): Promise<FileEntry[]> {
    try {
      this._tree = await this._vfs.listDir('/');
    } catch {
      this._tree = [];
    }
    this._notify();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('tree:refreshed', undefined);
    } catch { /* EventBus not yet registered */ }

    return this._tree;
  }

  // ── Workspace switching ────────────────────────────

  async switchLocal(dirPath: string): Promise<void> {
    this._vfs = new WorkspaceFileService(dirPath);
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];
    await this.refreshTree();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('workspace:changed', { path: dirPath, isRemote: false });
    } catch { /* EventBus not yet registered */ }
  }

  async connectSSH(config: SSHConfig): Promise<void> {
    const ssh = new SSHFileService(config);
    this._vfs = ssh;
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];

    try {
      this._tree = await ssh.listDir('/');
    } catch {
      // Connection failed — revert to local
      this._vfs = new WorkspaceFileService(DEFAULT_WORKSPACE);
      this._tree = await this._vfs.listDir('/');
      this._notify();
      throw new Error(`SSH connection failed: ${config.host}`);
    }

    this._notify();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('workspace:changed', { path: ssh.basePath, isRemote: true });
    } catch { /* EventBus not yet registered */ }
  }

  disconnect(): void {
    if (this._vfs instanceof SSHFileService) {
      this._vfs.disconnect();
    }
    this._vfs = new WorkspaceFileService(DEFAULT_WORKSPACE);
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];
    this._notify();
  }

  // ── React integration ─────────────────────────────

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.WorkspaceService, () => new WorkspaceService());
