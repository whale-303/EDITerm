/**
 * VFS (Virtual File System) — pure routing layer.
 *
 * The VFS maintains a mount table mapping VFS paths → IVFSProvider instances.
 * Every filesystem operation is routed to the correct provider by longest-prefix
 * match. The VFS itself has ZERO node:fs or node:path imports — it is purely
 * a dispatch table.
 *
 * Implements IFileService so the rest of the editor uses it transparently.
 *
 * ## Mount model
 *
 *   VFS path         Provider
 *   ──────────────────────────
 *   /      → LocalFileProvider    (all drives)
 *   /ssh/  → SSHFileService       (remote filesystem)
 *
 * A listDir('/') call hits the LocalFileProvider (longest prefix match '/').
 * listDir('/ssh/') hits SSHFileService (longest prefix match '/ssh/').
 *
 * Use mount() / unmount() to add or remove backends at runtime.
 */

import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import { logger } from '../../util/logger.js';
import type { FileEntry } from '../../types/index.js';
import type { IFileService } from './ifile-service.js';
import type { IVFSProvider } from './ivfs-provider.js';
import type { ExecResult } from './ivfs-provider.js';
import { vfsResolve, vfsParent, vfsBaseName, normalizeVfsPath } from './path-utils.js';

// ── Mount entry ─────────────────────────────────────

interface MountEntry {
  /** VFS path this provider is mounted at (always ends with /, except root '/'). */
  prefix: string;
  /** The backend provider. */
  provider: IVFSProvider;
}

// ── VFS class ───────────────────────────────────────

export class VFS implements IFileService {
  private _mounts: MountEntry[] = [];

  // ── Mount management ──────────────────────────────

  /**
   * Mount a provider at a VFS path.
   *
   * If a provider is already mounted at the same path, it is replaced.
   * Paths are normalized and stored in descending length order for
   * correct longest-prefix matching in _resolve().
   */
  mount(vfsPath: string, provider: IVFSProvider): void {
    const prefix = normalizeMountPath(vfsPath);

    // Remove existing mount at this exact prefix
    const idx = this._mounts.findIndex((m) => m.prefix === prefix);
    if (idx >= 0) this._mounts.splice(idx, 1);

    this._mounts.push({ prefix, provider });
    // Sort descending by prefix length: longest match first
    this._mounts.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /** Remove a mount. Returns false if no mount existed at that path. */
  unmount(vfsPath: string): boolean {
    const prefix = normalizeMountPath(vfsPath);
    const idx = this._mounts.findIndex((m) => m.prefix === prefix);
    if (idx < 0) return false;
    this._mounts.splice(idx, 1);
    return true;
  }

  /** List all active mounts (read-only). */
  listMounts(): ReadonlyArray<{ prefix: string; label: string }> {
    return this._mounts.map((m) => ({ prefix: m.prefix, label: m.provider.label }));
  }

  // ── IFileService implementation ────────────────────

  /** The VFS root is always '/'. */
  get basePath(): string {
    return '/';
  }

  resolve(...segments: string[]): string {
    return vfsResolve(...segments);
  }

  async listDir(dirPath: string): Promise<FileEntry[]> {
    const mount = this._findMount(dirPath);
    if (!mount) throw new Error(`VFS: no mount covers path "${dirPath}"`);
    const relPath = stripPrefix(ensureSlash(dirPath), mount.prefix);
    const entries = await mount.provider.listDir(relPath);

    // For non-root mounts, prefix provider-relative paths back to full VFS paths
    if (mount.prefix !== '/') {
      for (const entry of entries) {
        entry.path = joinVfs(mount.prefix, entry.path);
      }
    }
    return entries;
  }

  async readFile(filePath: string): Promise<string> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.readFile(relPath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.writeFile(relPath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.exists(relPath);
  }

  async delete(filePath: string): Promise<void> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.delete(relPath);
  }

  async rename(oldPath: string, newName: string): Promise<string> {
    const { provider, relPath } = this._resolve(oldPath);
    const newRelPath = await provider.rename(relPath, newName);
    // Reconstruct full VFS path
    const mountPrefix = this._findMount(oldPath)!.prefix;
    return joinVfs(mountPrefix, newRelPath);
  }

  async createFile(parentDir: string, name: string): Promise<string> {
    const { provider, relPath } = this._resolve(parentDir);
    const newRelPath = await provider.createFile(relPath, name);
    const mountPrefix = this._findMount(parentDir)!.prefix;
    return joinVfs(mountPrefix, newRelPath);
  }

  async createDirectory(parentDir: string, name: string): Promise<string> {
    const { provider, relPath } = this._resolve(parentDir);
    const newRelPath = await provider.createDirectory(relPath, name);
    const mountPrefix = this._findMount(parentDir)!.prefix;
    return joinVfs(mountPrefix, newRelPath);
  }

  parentDir(filePath: string): string {
    return vfsParent(filePath);
  }

  baseName(filePath: string): string {
    return vfsBaseName(filePath);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.isDirectory(relPath);
  }

  async copyEntry(srcPath: string, destDir: string): Promise<string> {
    const { provider: srcProv, relPath: srcRel } = this._resolve(srcPath);
    const { provider: destProv, relPath: destRel } = this._resolve(destDir);

    if (srcProv !== destProv) {
      // Cross-provider copy — not currently supported
      throw new Error('Cross-provider copy not supported');
    }

    const newRelPath = await srcProv.copyEntry(srcRel, destRel);
    const mountPrefix = this._findMount(srcPath)!.prefix;
    return joinVfs(mountPrefix, newRelPath);
  }

  async isProbablyBinary(filePath: string): Promise<boolean> {
    const { provider, relPath } = this._resolve(filePath);
    return provider.isProbablyBinary?.(relPath) ?? false;
  }

  // ── Native path bridge ─────────────────────────────

  /**
   * Convert a VFS path to a native OS path (if the provider supports it).
   * Returns null for providers that have no native path (e.g. SSH).
   */
  toNativePath(vfsPath: string): string | null {
    const { provider, relPath } = this._resolve(vfsPath);
    return provider.toNativePath?.(relPath) ?? null;
  }

  /**
   * Convert a native OS path to a VFS path (reverse of toNativePath).
   * Only works for providers that support toNativePath.
   */
  fromNativePath(nativePath: string): string | null {
    // Try each mount's provider to reverse-map the native path
    for (const mount of this._mounts) {
      if (mount.provider.fromNativePath) {
        const rel = mount.provider.fromNativePath(nativePath);
        if (rel !== null) {
          return joinVfs(mount.prefix, rel);
        }
      }
    }
    return null;
  }

  /**
   * Execute a shell command via the root-mounted backend.
   * For local providers: runs on the host. For SSH: runs on the remote.
   */
  async execCommand(command: string, options?: { cwd?: string }): Promise<ExecResult> {
    const rootMount = this._findMount('/');
    if (!rootMount) {
      logger.error('VFS', 'execCommand: no root mount');
      throw new Error('VFS: no root mount for command execution');
    }

    logger.info('VFS', 'execCommand delegating', { label: rootMount.provider.label, command: command.slice(0, 120), cwd: options?.cwd });

    if (rootMount.provider.execCommand) {
      try {
        const result = await rootMount.provider.execCommand(command, options);
        logger.trace('VFS', 'execCommand result', { code: result.code, stdoutLen: result.stdout.length, stderrLen: result.stderr.length });
        return result;
      } catch (e: any) {
        logger.error('VFS', 'execCommand provider threw', { label: rootMount.provider.label, error: e.message || String(e) });
        throw e;
      }
    }

    logger.error('VFS', 'provider does not support execCommand', { label: rootMount.provider.label });
    throw new Error(`Provider "${rootMount.provider.label}" does not support command execution`);
  }

  // ── Internal ───────────────────────────────────────

  /**
   * Find the mount entry responsible for a VFS path.
   * Returns the mount with the longest prefix that matches the path.
   */
  private _findMount(vfsPath: string): MountEntry | null {
    const normalized = normalizeVfsPath(vfsPath);
    for (const mount of this._mounts) {
      const mountNorm = normalizeVfsPath(mount.prefix);
      if (mount.prefix === '/') return mount; // root matches everything (last resort due to sort)
      if (normalized === mountNorm ||
          normalized.startsWith(mountNorm + '/')) {
        return mount;
      }
    }
    return null;
  }

  /**
   * Resolve a VFS path to a (provider, relativePath) pair.
   * Throws if no mount covers this path.
   */
  private _resolve(vfsPath: string): { provider: IVFSProvider; relPath: string } {
    const normalized = ensureSlash(vfsPath);
    const mount = this._findMount(normalized);
    if (!mount) {
      throw new Error(`VFS: no mount covers path "${vfsPath}"`);
    }
    const relPath = stripPrefix(normalized, mount.prefix);
    return { provider: mount.provider, relPath };
  }
}

// ── Registration ────────────────────────────────────

register(TOKENS.FileService, () => new VFS());

// ── Internal helpers ────────────────────────────────

/** Normalize a mount path: exactly '/' for root, or '/name/' format, lowercase. */
function normalizeMountPath(vfsPath: string): string {
  let p = vfsPath.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (p === '/' || p === '') return '/';
  p = '/' + p.replace(/^\/+/, '').replace(/\/+$/, '');
  return p.toLowerCase();
}

/** Ensure a path has a leading slash and no trailing slash. */
function ensureSlash(p: string): string {
  return '/' + p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Strip a mount prefix from a VFS path, yielding a provider-relative path. */
function stripPrefix(vfsPath: string, prefix: string): string {
  if (prefix === '/') {
    // Root mount: the relative path is the VFS path minus the leading /
    const rel = vfsPath.replace(/^\/+/, '');
    return rel;
  }
  // Non-root mount: strip the prefix
  let rel = vfsPath;
  if (rel.startsWith(prefix)) {
    rel = rel.slice(prefix.length);
  }
  return rel.replace(/^\/+/, '');
}

/** Join a mount prefix and provider-relative path back into a VFS path. */
function joinVfs(prefix: string, relPath: string): string {
  if (prefix === '/') {
    return '/' + relPath.replace(/^\/+/, '');
  }
  return prefix + '/' + relPath.replace(/^\/+/, '');
}



