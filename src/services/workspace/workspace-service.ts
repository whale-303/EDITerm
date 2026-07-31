/**
 * WorkspaceService — manages the current file workspace (local or remote).
 *
 * Uses the VFS singleton and switches workspaces by mounting different
 * providers at / rather than replacing the entire filesystem service.
 *
 * ## Mount modes
 *
 *   Full-filesystem (default):
 *     LocalFileProvider() mounted at /  →  / lists drives
 *     _workspaceVPath = /e/Projects/... →  sidebar navigates to workspace
 *
 *   Scoped workspace (Open Folder):
 *     LocalFileProvider(rootDir) at /  →  / is the workspace directory
 *     _workspaceVPath = /
 *
 *   Remote (SSH):
 *     SSHFileService at /              →  / is the remote root
 *     _workspaceVPath = /
 *
 * Registered as DI singleton via TOKENS.WorkspaceService.
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import { VFS } from '../file/vfs.js';
import { LocalFileProvider } from '../file/local-file-provider.js';
import { SSHFileService } from '../file/ssh-service.js';
import { realToVfs, vfsToReal } from '../file/path-utils.js';
import type { SSHConfig } from '../file/ssh-service.js';
import type { IFileService } from '../file/ifile-service.js';
import type { FileEntry } from '../../types/index.js';
import type { IWorkspaceService } from './iworkspace-service.js';
import type { IEventBus } from '../../core/events/event-bus.js';
import { elog } from '../../util/error-log.js';
import type { IGitService } from '../git/igit-service.js';

const DEFAULT_WORKSPACE = './test_workspace';

export class WorkspaceService implements IWorkspaceService {
  private _vfs: VFS;
  private _tree: FileEntry[] = [];
  private _workspaceVPath: string;  // VFS path to the workspace directory
  private _sidebarPath: string;
  private _expanded = new Set<string>(['/']);
  private _listeners = new Set<() => void>();

  constructor() {
    this._vfs = getService<VFS>(TOKENS.FileService);

    // Default: full-filesystem mode (drive listing at root)
    this._vfs.mount('/', new LocalFileProvider());

    // Determine default workspace VFS path
    const resolved = resolve(DEFAULT_WORKSPACE);
    this._workspaceVPath = realToVfs(resolved);

    // Ensure the default workspace directory exists (with seed files)
    this._ensureDefaultWorkspace(resolved);

    // Start sidebar at the workspace directory
    this._sidebarPath = this._workspaceVPath;
  }

  // ── Accessors ─────────────────────────────────────

  get vfs(): IFileService {
    return this._vfs;
  }

  get isRemote(): boolean {
    const mounts = this._vfs.listMounts();
    return mounts.some((m) => m.label.startsWith('ssh'));
  }

  /** VFS path of the current workspace root. */
  get basePath(): string {
    return this._workspaceVPath;
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
      this._loadChildren(path).then(() => this._notify());
    }
    this._expanded = next;
    this._notify();
    return next.has(path);
  }

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

    // In full-filesystem mode, expand the path from / down to the workspace
    if (this._workspaceVPath !== '/') {
      await this._expandPathToWorkspace();
    }

    this._notify();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('tree:refreshed', undefined);
    } catch { /* EventBus not yet registered */ }

    return this._tree;
  }

  /** Expand directories along the path from / to the workspace directory. */
  private async _expandPathToWorkspace(): Promise<void> {
    const parts = this._workspaceVPath.split('/').filter(Boolean);
    let vpath = '';
    for (const part of parts) {
      vpath += `/${part}`;
      const node = this._findNode(this._tree, vpath);
      if (node && node.isDirectory && !node.children) {
        try {
          node.children = await this._vfs.listDir(vpath);
        } catch { /* directory might not be readable */ }
      }
    }
  }

  // ── Workspace switching ────────────────────────────

  async switchLocal(dirPath: string): Promise<void> {
    // Accept both VFS paths (/e/Projects/...) and real paths (E:\Projects\...)
    const realPath = dirPath.startsWith('/')
      ? vfsToReal(dirPath)
      : resolve(dirPath);

    // Replace root mount with a scoped provider
    this._vfs.unmount('/');
    this._vfs.mount('/', new LocalFileProvider(realPath));

    // Now / IS the workspace
    this._workspaceVPath = '/';
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];

    // Invalidate git caches — repo root has changed
    try { getService<IGitService>(TOKENS.GitService).refresh(); } catch {}

    await this.refreshTree();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('workspace:changed', { path: realPath, isRemote: false });
    } catch { /* EventBus not yet registered */ }
  }

  async connectSSH(config: SSHConfig): Promise<void> {
    const ssh = new SSHFileService(config);
    this._vfs.unmount('/');
    this._vfs.mount('/', ssh);

    this._workspaceVPath = '/';
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];

    // Invalidate git caches — backend has changed to SSH
    try { getService<IGitService>(TOKENS.GitService).refresh(); } catch {}

    try {
      this._tree = await this._vfs.listDir('/');
    } catch (e: any) {
      elog(`WorkspaceService.connectSSH: ${e.message}`);
      // Connection failed — revert to full-filesystem local
      this._vfs.unmount('/');
      this._vfs.mount('/', new LocalFileProvider());
      this._workspaceVPath = realToVfs(resolve(DEFAULT_WORKSPACE));
      try { getService<IGitService>(TOKENS.GitService).refresh(); } catch {}
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
    // Remove all mounts and go back to full-filesystem local
    const mounts = this._vfs.listMounts();
    for (const m of mounts) this._vfs.unmount(m.prefix);

    this._vfs.mount('/', new LocalFileProvider());
    this._workspaceVPath = realToVfs(resolve(DEFAULT_WORKSPACE));
    this._sidebarPath = '/';
    this._expanded = new Set(['/']);
    this._tree = [];
    // Invalidate git caches — backend changed
    try { getService<IGitService>(TOKENS.GitService).refresh(); } catch {}
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

  // ── Default workspace seeding ──────────────────────

  private _ensureDefaultWorkspace(abs: string): void {
    mkdirSync(abs, { recursive: true });
    let entries: string[] = [];
    try { entries = readdirSync(abs); } catch { /* ignore */ }
    if (entries.length === 0) {
      writeFileSync(join(abs, 'README.md'),
        '# EDITerm Workspace\n\n' +
        'Welcome! Use ↑↓ to navigate, Enter to open, Tab to switch files.\n',
        'utf-8',
      );
    }
  }
}

register(TOKENS.WorkspaceService, () => new WorkspaceService());
