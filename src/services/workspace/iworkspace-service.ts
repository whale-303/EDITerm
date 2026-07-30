/**
 * IWorkspaceService — workspace / file-tree / vfs management.
 * Wraps IFileService (local or SSH) and manages the file tree state.
 */
import type { FileEntry } from '../../types/index.js';
import type { IFileService } from '../file/ifile-service.js';
import type { SSHConfig } from '../file/ssh-service.js';

export interface IWorkspaceService {
  /** Current filesystem backend. */
  readonly vfs: IFileService;

  /** Whether the current workspace is remote (SSH). */
  readonly isRemote: boolean;

  /** Display path for the workspace root. */
  readonly basePath: string;

  // ── Tree ──────────────────────────────────────────

  /** Current file tree (root children). */
  readonly tree: FileEntry[];

  /** Currently highlighted path in sidebar. */
  readonly sidebarPath: string;

  /** Currently expanded directory paths. */
  readonly expandedPaths: ReadonlySet<string>;

  /** Set the highlighted sidebar path. */
  setSidebarPath(path: string): void;

  /** Toggle a directory's expanded state. Returns new expanded state. */
  toggleExpand(path: string): boolean;

  /** Refresh the file tree from the current vfs. */
  refreshTree(): Promise<FileEntry[]>;

  // ── Workspace switching ────────────────────────────

  /** Switch to a local workspace directory. */
  switchLocal(dirPath: string): Promise<void>;

  /** Connect to a remote SSH workspace. */
  connectSSH(config: SSHConfig): Promise<void>;

  /** Disconnect from remote and return to local. */
  disconnect(): void;

  // ── React integration ─────────────────────────────

  /** Subscribe to state changes. Returns unsubscribe function. */
  onChange(fn: () => void): () => void;
}
