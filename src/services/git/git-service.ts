/**
 * GitService — delegates diff parsing to `parse-diff`, fetches raw diff
 * and workspace status via `git` CLI through the VFS execCommand bridge.
 *
 * Works transparently for both local (child_process) and SSH (node-ssh)
 * filesystem backends.
 *
 * Results are cached with a short TTL. On cache miss the sync accessors
 * trigger an async background refresh and return stale/empty data.
 *
 * Registered as DI singleton via TOKENS.GitService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import parseDiff from 'parse-diff';
import { logger } from '../../util/logger.js';
import { normalizeVfsPath } from '../file/path-utils.js';
import type { VFS } from '../file/vfs.js';
import type { DiffInfo, DiffLineType, GitFileStatus } from './igit-service.js';
import type { IGitService } from './igit-service.js';

const CACHE_TTL = 2000; // ms

/** Priority for directory status inheritance: higher = overrides lower. */
const STATUS_PRIORITY: Record<string, number> = {
  modified: 3,
  added: 2,
  renamed: 1,
  deleted: 0,
};

export class GitService implements IGitService {
  private _diffCache = new Map<string, { info: DiffInfo; ts: number }>();
  private _statusCache: Map<string, GitFileStatus> | null = null;
  private _statusCacheTs = 0;
  private _repoRootCache: string | null = null;
  private _repoRootResolved = false;
  private _listeners = new Set<() => void>();

  // Async inflight guards (prevent duplicate background refreshes)
  private _statusInflight = false;
  private _diffInflight = new Set<string>();

  // ── public API (sync) ────────────────────────────────

  getFileDiff(filePath: string, currentContent: string): DiffInfo | null {
    const cached = this._diffCache.get(filePath);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      logger.hit('GitService', 'diff cache hit', { path: filePath, lines: cached.info.lines.size, delAbove: cached.info.deletionAbove.size });
      return cached.info;
    }

    logger.miss('GitService', 'diff cache miss', { path: filePath, inflight: this._diffInflight.has(filePath) });
    // Trigger async refresh in background (no await — fire-and-forget)
    if (!this._diffInflight.has(filePath)) {
      logger.info('GitService', 'triggering async diff refresh', { path: filePath });
      this._refreshFileDiff(filePath, currentContent);
    }

    // Return stale cache if available, otherwise empty
    return cached?.info ?? this._emptyInfo();
  }

  getWorkspaceStatus(): Map<string, GitFileStatus> {
    if (this._statusCache && Date.now() - this._statusCacheTs < CACHE_TTL) {
      logger.hit('GitService', 'status cache hit', { size: this._statusCache.size });
      return this._statusCache;
    }

    logger.miss('GitService', 'status cache miss', { hasCache: !!this._statusCache, inflight: this._statusInflight });
    // Trigger async refresh
    if (!this._statusInflight) {
      logger.info('GitService', 'triggering async status refresh');
      this._refreshWorkspaceStatus();
    }

    return this._statusCache ?? new Map();
  }

  refresh(): void {
    this._diffCache.clear();
    this._statusCache = null;
    this._statusCacheTs = 0;
    this._repoRootResolved = false;
    this._repoRootCache = null;
  }

  // ── React integration ─────────────────────────────

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }

  // ── Async internals ──────────────────────────────────

  private async _refreshFileDiff(filePath: string, currentContent: string): Promise<void> {
    this._diffInflight.add(filePath);
    logger.info('GitService', '_refreshFileDiff start', { path: filePath });
    try {
      const repo = await this._repoRoot();
      if (!repo) {
        logger.warn('GitService', 'no repo root for diff', { path: filePath });
        return;
      }

      const vfs = getService<VFS>(TOKENS.FileService);
      const realPath = vfs.toNativePath(filePath);
      if (!realPath) {
        logger.warn('GitService', 'toNativePath returned null', { vfsPath: filePath });
        return;
      }
      logger.info('GitService', 'real path resolved', { vfsPath: filePath, realPath });

      // Path relative to git repo root
      const relPath = this._repoRelPath(repo, realPath);
      logger.info('GitService', 'running git diff', { relPath, repo });

      // Try HEAD first (committed files with local edits)
      let raw = await this._exec(
        `git diff --no-color --unified=3 HEAD -- "${relPath}"`, repo,
      );
      if (raw !== null) {
        logger.info('GitService', 'HEAD diff succeeded', { bytes: raw.length });
      } else {
        logger.fallback('GitService', 'HEAD diff failed, trying --no-index');
        raw = await this._exec(
          `git diff --no-color --unified=3 --no-index -- /dev/null "${realPath}"`, repo,
        );
        if (raw !== null) {
          logger.info('GitService', '--no-index diff succeeded', { bytes: raw.length });
        }
      }

      if (raw === null || !raw.trim()) {
        logger.warn('GitService', 'diff returned empty/null — using empty info', { rawLen: raw?.length ?? 0 });
        const info = this._emptyInfo();
        this._diffCache.set(filePath, { info, ts: Date.now() });
      } else {
        const files = parseDiff(raw);
        const info = this._buildDiffInfo(files, currentContent);
        logger.info('GitService', 'diff parsed', { fileCount: files.length, linesChanged: info.lines.size, deletionsAbove: info.deletionAbove.size });
        this._diffCache.set(filePath, { info, ts: Date.now() });
      }
      this._notify();
    } catch (e: any) {
      logger.error('GitService', '_refreshFileDiff exception', { path: filePath, error: e.message || String(e) });
    } finally {
      this._diffInflight.delete(filePath);
    }
  }

  private async _refreshWorkspaceStatus(): Promise<void> {
    this._statusInflight = true;
    logger.info('GitService', '_refreshWorkspaceStatus start');
    try {
      const repo = await this._repoRoot();
      if (!repo) {
        logger.warn('GitService', 'no repo root — aborting status refresh');
        this._statusCache = new Map();
        this._statusCacheTs = Date.now();
        return;
      }
      logger.info('GitService', 'repo root found', { repo });

      const out = await this._exec('git status --porcelain', repo);
      if (out === null) {
        logger.error('GitService', 'git status --porcelain returned null');
        this._statusCache = new Map();
        this._statusCacheTs = Date.now();
        return;
      }
      logger.info('GitService', 'git status --porcelain output', { lines: out.trim().split('\n').length, out: out.slice(0, 500) });

      const fileMap = new Map<string, GitFileStatus>();
      const vfs2 = getService<VFS>(TOKENS.FileService);
      const repoVpath = vfs2.fromNativePath(repo) ?? '';
      const prefix = repoVpath === '/' || repoVpath === '' ? '' : repoVpath;
      logger.info('GitService', 'VFS prefix', { repoVpath, prefix });

      for (const line of out.trim().split('\n')) {
        if (!line) continue;
        const s = this._parsePorcelain(line, prefix);
        if (s) {
          const clean = s.path.replace(/\/$/, '');
          fileMap.set(clean, s.status === 'untracked' ? { path: clean, status: 'added' } : s);
        }
      }

      const result = this._propagateDirectoryStatuses(fileMap);
      logger.info('GitService', 'status refresh complete', { fileCount: result.size });
      this._statusCache = result;
      this._statusCacheTs = Date.now();
      this._notify();
    } catch (e: any) {
      logger.error('GitService', '_refreshWorkspaceStatus exception', { error: e.message || String(e) });
    } finally {
      this._statusInflight = false;
    }
  }

  // ── Shell execution (via VFS) ────────────────────────

  /** Run a command via the VFS-mounted backend. Returns stdout or null. */
  private async _exec(command: string, cwd?: string): Promise<string | null> {
    try {
      const vfs = getService<VFS>(TOKENS.FileService);
      const mounts = vfs.listMounts();
      if (mounts.length === 0) {
        logger.error('GitService', '_exec: no VFS mounts');
        return null;
      }
      logger.trace('GitService', '_exec: running command', { command: command.slice(0, 120), cwd, mountCount: mounts.length });
      const result = await vfs.execCommand(command, { cwd });
      logger.trace('GitService', '_exec: result', { code: result.code, stdoutLen: result.stdout.length, stderrLen: result.stderr.length });
      if (result.code !== 0 && result.code !== null) {
        logger.warn('GitService', '_exec: non-zero exit', { code: result.code, stderr: result.stderr.slice(0, 200) });
        return null;
      }
      return result.stdout;
    } catch (e: any) {
      logger.error('GitService', '_exec exception', { command: command.slice(0, 120), error: e.message || String(e) });
      return null;
    }
  }

  // ── Repo root ────────────────────────────────────────

  private async _repoRoot(): Promise<string | null> {
    if (this._repoRootResolved) {
      logger.trace('GitService', '_repoRoot cached', { value: this._repoRootCache });
      return this._repoRootCache;
    }
    this._repoRootResolved = true;
    logger.info('GitService', '_repoRoot: running git rev-parse --show-toplevel');
    try {
      const vfs = getService<VFS>(TOKENS.FileService);
      const result = await vfs.execCommand('git rev-parse --show-toplevel');
      logger.info('GitService', '_repoRoot: result', { code: result.code, stdout: result.stdout.slice(0, 200), stderr: result.stderr.slice(0, 200) });
      if (result.code === 0) {
        this._repoRootCache = result.stdout.trim();
        logger.info('GitService', '_repoRoot resolved', { repo: this._repoRootCache });
        return this._repoRootCache;
      }
      logger.warn('GitService', '_repoRoot: not a git repo', { code: result.code, stderr: result.stderr.slice(0, 200) });
      return null;
    } catch (e: any) {
      logger.error('GitService', '_repoRoot exception', { error: e.message || String(e) });
      return null;
    }
  }

  /** Compute a repo-relative path by stripping the repo root prefix. */
  private _repoRelPath(repoRoot: string, absPath: string): string {
    const repoNorm = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const absNorm = absPath.replace(/\\/g, '/');
    // Case-insensitive comparison — Windows drive letters / path casing may differ
    // between git rev-parse output and VFS toNativePath
    if (absNorm.toLowerCase().startsWith(repoNorm.toLowerCase() + '/')) {
      return absNorm.slice(repoNorm.length + 1);
    }
    return absNorm;
  }

  // ── Directory propagation ────────────────────────────

  private _propagateDirectoryStatuses(
    fileMap: Map<string, GitFileStatus>,
  ): Map<string, GitFileStatus> {
    const result = new Map(fileMap);
    for (const [, status] of fileMap) {
      let dir = this._parentDir(status.path);
      while (dir) {
        const existing = result.get(dir);
        if (existing) {
          if (STATUS_PRIORITY[status.status] > STATUS_PRIORITY[existing.status]) {
            result.set(dir, { path: dir, status: status.status, propagated: true });
          }
        } else {
          result.set(dir, { path: dir, status: status.status, propagated: true });
        }
        dir = this._parentDir(dir);
      }
    }
    return result;
  }

  private _parentDir(p: string): string | undefined {
    const last = p.lastIndexOf('/');
    if (last <= 0) return undefined;
    return p.slice(0, last);
  }

  // ── Diff parsing ─────────────────────────────────────

  private _buildDiffInfo(files: parseDiff.File[], _currentContent: string): DiffInfo {
    const lines = new Map<number, DiffLineType>();
    const deletionAbove = new Set<number>();

    const file = files[0];
    if (!file || file.deleted) return { lines, deletionAbove };

    for (const chunk of file.chunks) {
      let newLine = chunk.newStart;
      let i = 0;
      const changes = chunk.changes;

      while (i < changes.length) {
        const ch = changes[i];

        if (ch.type === 'normal') {
          newLine++;
          i++;
        } else if (ch.type === 'del') {
          const delCount = this._countWhile(changes, i, 'del');
          const addIdx = i + delCount;
          const addCount = this._countWhile(changes, addIdx, 'add');

          if (addCount > 0) {
            for (let j = 0; j < addCount; j++) {
              lines.set(newLine - 1 + j, 'modified');
            }
            newLine += addCount;
            i = addIdx + addCount;
          } else {
            if (newLine > 1) {
              deletionAbove.add(newLine - 2);
            } else {
              deletionAbove.add(0);
            }
            i += delCount;
          }
        } else if (ch.type === 'add') {
          const addCount = this._countWhile(changes, i, 'add');
          for (let j = 0; j < addCount; j++) {
            lines.set(newLine - 1 + j, 'added');
          }
          newLine += addCount;
          i += addCount;
        }
      }
    }

    return { lines, deletionAbove };
  }

  private _countWhile(changes: parseDiff.Change[], idx: number, type: string): number {
    let n = 0;
    while (idx + n < changes.length && changes[idx + n].type === type) n++;
    return n;
  }

  private _emptyInfo(): DiffInfo {
    return { lines: new Map(), deletionAbove: new Set() };
  }

  // ── Porcelain parser ─────────────────────────────────

  private _parsePorcelain(line: string, prefix: string): GitFileStatus | null {
    if (line.length < 4) return null;

    const idx = line.charCodeAt(0);
    const wd  = line.charCodeAt(1);

    if (idx === 0x52 /* R */ || wd === 0x52 /* R */) {
      const arrow = line.indexOf(' -> ');
      let newPath = arrow >= 0 ? line.slice(arrow + 4) : line.slice(3);
      let oldPath: string | undefined = arrow >= 0 ? line.slice(3, arrow) : undefined;
      if (newPath.startsWith('"') && newPath.endsWith('"')) {
        newPath = newPath.slice(1, -1).replace(/\\"/g, '"');
      }
      if (oldPath && oldPath.startsWith('"') && oldPath.endsWith('"')) {
        oldPath = oldPath.slice(1, -1).replace(/\\"/g, '"');
      }
      oldPath = oldPath ? normalizeVfsPath(`${prefix}/${oldPath}`) : undefined;
      return { path: normalizeVfsPath(`${prefix}/${newPath}`), status: 'renamed', oldPath };
    }

    let fpath = line.slice(3);
    if (fpath.startsWith('"') && fpath.endsWith('"')) {
      fpath = fpath.slice(1, -1).replace(/\\"/g, '"');
    }
    fpath = normalizeVfsPath(prefix ? `${prefix}/${fpath}` : `/${fpath}`);

    if (wd === 0x3f /* ? */) return { path: fpath, status: 'untracked' };
    if (wd === 0x4d /* M */) return { path: fpath, status: 'modified' };
    if (wd === 0x44 /* D */) return { path: fpath, status: 'deleted' };
    if (wd === 0x41 /* A */) return { path: fpath, status: 'added' };

    if (idx === 0x4d /* M */) return { path: fpath, status: 'modified' };
    if (idx === 0x41 /* A */) return { path: fpath, status: 'added' };
    if (idx === 0x44 /* D */) return { path: fpath, status: 'deleted' };

    return null;
  }
}

register(TOKENS.GitService, () => new GitService());
