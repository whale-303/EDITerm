/**
 * LocalFileProvider — local filesystem backend for the VFS.
 *
 * Implements IVFSProvider. Two modes:
 *
 * ## Full-filesystem mode (rootDir = undefined)
 *
 * Provides access to all drives. The first segment of any path is the drive letter:
 *   ""             → drive listing (C:, D:, …)
 *   "c/Users/foo"  → C:\Users\foo
 *   "e/Projects"   → E:\Projects
 *
 * ## Scoped workspace mode (rootDir = "E:\Projects\EDITerm\test_workspace")
 *
 * All paths are relative to rootDir. Empty path = rootDir itself:
 *   ""              → rootDir contents
 *   "src/index.ts"  → <rootDir>\src\index.ts
 *
 * This is the ONLY module that imports node:fs for concrete filesystem access.
 * All other VFS modules are pure routing or path manipulation.
 */

import { promises as fsp } from 'node:fs';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'child_process';
import { dirname, join, resolve, sep } from 'node:path';
import type { FileEntry } from '../../types/index.js';
import type { IVFSProvider, ExecResult } from './ivfs-provider.js';
import { realToVfs } from './path-utils.js';
import { isBinaryContent } from '../../util/binary-detect.js';

export class LocalFileProvider implements IVFSProvider {
  readonly label = 'local';

  /** If set, all paths resolve relative to this real directory. */
  private _rootReal: string | undefined;

  /**
   * @param rootDir  Optional — if provided, the provider is scoped to this
   *                 directory. Empty path maps to rootDir, all paths are
   *                 relative to it. If omitted, full filesystem with drive
   *                 listing is exposed.
   */
  constructor(rootDir?: string) {
    if (rootDir) {
      this._rootReal = resolve(rootDir);
    }
  }

  /** Whether this provider is scoped to a single directory. */
  get isScoped(): boolean {
    return this._rootReal !== undefined;
  }

  // ── Native path bridge ─────────────────────────────

  toNativePath(relPath: string): string | null {
    return this._toOSPath(relPath);
  }

  /** Inverse of toNativePath. Maps a real OS path back to provider-relative. */
  fromNativePath(nativePath: string): string | null {
    const normalized = resolve(nativePath).replace(/\\/g, '/');

    // Scoped mode: only accept paths inside rootDir
    if (this._rootReal) {
      const rootNorm = this._rootReal.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normalized === rootNorm) return '';
      if (normalized.startsWith(rootNorm + '/')) {
        return normalized.slice(rootNorm.length + 1);
      }
      return null; // outside scope
    }

    // Full-filesystem: same logic as realToVfs
    const m = /^([a-zA-Z]):(.*)$/.exec(normalized);
    if (m) {
      const drive = m[1].toLowerCase();
      const rest = m[2].replace(/\/+$/, '');
      return rest ? `${drive}${rest}` : drive;
    }
    return null;
  }

  /** Execute a shell command on the local machine. */
  async execCommand(command: string, options?: { cwd?: string }): Promise<ExecResult> {
    try {
      const stdout = execSync(command, {
        cwd: options?.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 8000,
      });
      return { stdout, stderr: '', code: 0 };
    } catch (e: any) {
      return {
        stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? ''),
        code: e.status ?? 1,
      };
    }
  }

  // ── Pure path operations ───────────────────────────

  resolve(...segments: string[]): string {
    const joined = segments.join('/').replace(/\\/g, '/');
    const parts = joined.split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') { resolved.pop(); continue; }
      resolved.push(p);
    }
    return resolved.join('/');
  }

  parentDir(relPath: string): string {
    const cleaned = relPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (cleaned === '') return '';
    const last = cleaned.lastIndexOf('/');
    return last < 0 ? '' : cleaned.slice(0, last);
  }

  baseName(relPath: string): string {
    const parts = relPath.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  // ── Filesystem operations ──────────────────────────

  async listDir(relPath: string): Promise<FileEntry[]> {
    // Full-filesystem root → drive listing
    if (!this._rootReal && (relPath === '' || relPath === '/')) {
      return this._listDrives();
    }

    const abs = this._toOSPath(relPath);
    let entries: any[];
    try {
      entries = await fsp.readdir(abs, { withFileTypes: true }) as any;
    } catch {
      return [];
    }

    const prefix = relPath.replace(/\/+$/, '');
    const result: FileEntry[] = [];

    for (const d of entries) {
      if (d.name.startsWith('.')) continue;
      result.push({
        name: d.name,
        path: prefix ? `/${prefix}/${d.name}` : `/${d.name}`,
        isDirectory: d.isDirectory(),
      });
    }
    result.sort((a, b) =>
      (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name),
    );
    return result;
  }

  async readFile(relPath: string): Promise<string> {
    return fsp.readFile(this._toOSPath(relPath), 'utf-8');
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    const abs = this._toOSPath(relPath);
    await fsp.mkdir(dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, 'utf-8');
  }

  async exists(relPath: string): Promise<boolean> {
    try { await fsp.access(this._toOSPath(relPath)); return true; } catch { return false; }
  }

  async delete(relPath: string): Promise<void> {
    const abs = this._toOSPath(relPath);
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) {
      await fsp.rm(abs, { recursive: true, force: true });
    } else {
      await fsp.unlink(abs);
    }
  }

  async rename(oldPath: string, newName: string): Promise<string> {
    const oldAbs = this._toOSPath(oldPath);
    const newAbs = join(dirname(oldAbs), newName);
    await fsp.rename(oldAbs, newAbs);
    const dir = this.parentDir(oldPath);
    return dir ? `${dir}/${newName}` : newName;
  }

  async createFile(parentDir: string, name: string): Promise<string> {
    const absDir = this._toOSPath(parentDir);
    await fsp.mkdir(absDir, { recursive: true });
    await fsp.writeFile(join(absDir, name), '', 'utf-8');
    return parentDir ? `${parentDir}/${name}` : name;
  }

  async createDirectory(parentDir: string, name: string): Promise<string> {
    const absDir = this._toOSPath(parentDir);
    const absPath = join(absDir, name);
    await fsp.mkdir(absPath, { recursive: true });
    return parentDir ? `${parentDir}/${name}` : name;
  }

  async isDirectory(relPath: string): Promise<boolean> {
    try {
      return (await fsp.stat(this._toOSPath(relPath))).isDirectory();
    } catch {
      return false;
    }
  }

  async copyEntry(srcPath: string, destDir: string): Promise<string> {
    const srcName = this.baseName(srcPath);
    const srcAbs = this._toOSPath(srcPath);
    const destAbs = this._toOSPath(destDir);
    const destAbsPath = join(destAbs, srcName);
    const stat = await fsp.stat(srcAbs);
    if (stat.isDirectory()) {
      await this._copyDirRecursive(srcAbs, destAbsPath);
    } else {
      await fsp.mkdir(dirname(destAbsPath), { recursive: true });
      await fsp.copyFile(srcAbs, destAbsPath);
    }
    return `${destDir}/${srcName}`;
  }

  async isProbablyBinary(relPath: string): Promise<boolean> {
    try {
      const abs = this._toOSPath(relPath);
      const fh = await fsp.open(abs, 'r');
      try {
        const buf = Buffer.alloc(8192);
        const { bytesRead } = await fh.read(buf, 0, 8192, 0);
        return isBinaryContent(buf.subarray(0, bytesRead));
      } finally {
        await fh.close();
      }
    } catch {
      return false; // can't read → let readFile surface the real error
    }
  }

  // ── Internal ─────────────────────────────────────

  /**
   * Convert a provider-relative path to a real OS path.
   *
   * Scoped mode:    "" → rootReal,  "src/foo" → rootReal\src\foo
   * Full-filesystem: "" → '' (caller handles),  "c/Users" → C:\Users
   */
  private _toOSPath(relPath: string): string {
    const cleaned = relPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '';

    // Scoped: everything is relative to rootReal
    if (this._rootReal) {
      return cleaned ? join(this._rootReal, ...cleaned.split('/')) : this._rootReal;
    }

    // Full-filesystem: first segment is drive letter
    if (cleaned === '') return '';
    const parts = cleaned.split('/').filter(Boolean);
    const first = parts[0] ?? '';
    if (/^[a-zA-Z]$/.test(first)) {
      const rest = parts.slice(1).join(sep);
      return rest ? `${first.toUpperCase()}:${sep}${rest}` : `${first.toUpperCase()}:${sep}`;
    }
    // Fallback: treat as relative to cwd
    return resolve(cleaned);
  }

  /** List available drives (full-filesystem mode only). */
  private async _listDrives(): Promise<FileEntry[]> {
    const drives: FileEntry[] = [];
    for (let code = 67; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      try {
        await fsp.access(`${letter}:\\`);
        drives.push({
          name: letter.toLowerCase(),
          path: `/${letter.toLowerCase()}`,
          isDirectory: true,
        });
      } catch { /* not available */ }
    }
    return drives;
  }

  private async _copyDirRecursive(srcAbs: string, destAbs: string): Promise<void> {
    await fsp.mkdir(destAbs, { recursive: true });
    const entries = await fsp.readdir(srcAbs, { withFileTypes: true });
    for (const entry of entries) {
      const srcChild = join(srcAbs, entry.name);
      const destChild = join(destAbs, entry.name);
      if (entry.isDirectory()) {
        await this._copyDirRecursive(srcChild, destChild);
      } else {
        await fsp.copyFile(srcChild, destChild);
      }
    }
  }
}
