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
import { elog } from '../../util/error-log.js';

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
      // Lazy-load children for this directory if not yet loaded
      this._loadChildren(path).then(() => this._notify());
    }
    this._expanded = next;
    this._notify();
    return next.has(path);
  }

  /** Lazily load children for a directory node in the tree. Does NOT notify. */
  private async _loadChildren(dirPath: string): Promise<void> {
    const node = this._findNode(this._tree, dirPath);
    if (node && node.isDirectory && !node.children) {
      try {
        node.children = await this._vfs.listDir(dirPath);
      } catch (e: any) {
        elog(`WorkspaceService._loadChildren ${dirPath}: ${e.message}`);
      }
    }
  }

  /** Recursively find a node by path in the tree. */
  private _findNode(nodes: FileEntry[], target: string): FileEntry | null {
    for (const n of nodes) {
      if (n.path === target) return n;
      if (n.children) {
        const found = this._findNode(n.children, target);
        if (found) return found;
      }
    }
    return null;
  }

  async refreshTree(): Promise<FileEntry[]> {
    try {
      this._tree = await this._vfs.listDir('/');
    } catch (e: any) {
      elog(`WorkspaceService.refreshTree: ${e.message}`);
      this._tree = [];
    }

    // Re-expand directories that were expanded before refresh
    if (this._expanded.size > 1) { // >1 because '/' is always there
      const dirs = [...this._expanded].filter(d => d !== '/');
      for (const dir of dirs) {
        await this._loadChildren(dir);
      }
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
    } catch (e: any) {
      elog(`WorkspaceService.connectSSH: ${e.message}`);
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
