/**
 * WorkspaceFileService — real filesystem backed by a base directory.
 */
import { promises as fs } from 'node:fs';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { FileEntry } from '../../types/index.js';
import type { IFileService } from './ifile-service.js';

const SEP = '/';

export class WorkspaceFileService implements IFileService {
  basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
    this._ensureWorkspace();
  }

  /** Switch to a different workspace directory. Clears the seed-on-empty behavior. */
  changeWorkspace(newPath: string): void {
    this.basePath = path.resolve(newPath);
    // Don't seed — empty workspace stays empty for user folders
  }

  private _ensureWorkspace(): void {
    mkdirSync(this.basePath, { recursive: true });
    // Seed sample files if the workspace is empty
    let entries: string[] = [];
    try { entries = readdirSync(this.basePath); } catch { /* ignore */ }
    if (entries.length === 0) {
      const readme = path.join(this.basePath, 'README.md');
      writeFileSync(readme,
        '# EDITerm Workspace\n\n' +
        'Welcome! This is your workspace directory.\n\n' +
        '## Shortcuts\n' +
        '- `E` / Right-click → context menu (New File, Rename, Delete, Copy/Paste…)\n' +
        '- `S` → save highlighted file\n' +
        '- `Tab` → cycle dirty files\n' +
        '- `Enter` → open file / expand directory\n',
        'utf-8',
      );
      mkdirSync(path.join(this.basePath, 'src'), { recursive: true });
      writeFileSync(path.join(this.basePath, 'src', 'main.ts'),
        '// Main entry point\n\nconsole.log("Hello EDITerm!");\n', 'utf-8');
    }
  }

  /** Convert a repo-relative path (e.g. "/src/index.ts") → absolute filesystem path. */
  private abs(rel: string): string {
    const cleaned = rel.replace(/\\/g, SEP).replace(/^\/+/, '');
    return path.join(this.basePath, cleaned);
  }

  /** Convert an absolute path back to a repo-relative path. */
  private rel(absPath: string): string {
    const r = path.relative(this.basePath, absPath).replace(/\\/g, SEP);
    return r.startsWith(SEP) ? r : SEP + r;
  }

  // ── IFileService compat ──────────────────────────────

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(this.abs(filePath), 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const absPath = this.abs(filePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try { await fs.access(this.abs(filePath)); return true; } catch { return false; }
  }

  resolve(...segments: string[]): string {
    const joined = segments.join(SEP).replace(/\\/g, SEP);
    const parts = joined.split(SEP).filter(Boolean);
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') { resolved.pop(); continue; }
      resolved.push(p);
    }
    return SEP + resolved.join(SEP);
  }

  // ── Tree building (lazy — children loaded on expand) ─

  async listDir(dirPath: string): Promise<FileEntry[]> {
    const absPath = this.abs(dirPath);
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const result: FileEntry[] = [];
    for (const d of entries) {
      if (d.name.startsWith('.')) continue; // skip hidden
      const childPath = dirPath === '/' ? `/${d.name}` : `${dirPath}/${d.name}`;
      result.push({
        name: d.name,
        path: childPath,
        isDirectory: d.isDirectory(),
        // children NOT populated — lazy loaded on expand
      });
    }
    result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
    return result;
  }

  // ── File operations ─────────────────────────────────

  async delete(filePath: string): Promise<void> {
    const absPath = this.abs(filePath);
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true, force: true });
    } else {
      await fs.unlink(absPath);
    }
  }

  async rename(oldPath: string, newName: string): Promise<string> {
    const oldAbs = this.abs(oldPath);
    const dir = path.dirname(oldAbs);
    const newAbs = path.join(dir, newName);
    await fs.rename(oldAbs, newAbs);
    return this.rel(newAbs);
  }

  async createFile(parentDir: string, name: string): Promise<string> {
    const absDir = this.abs(parentDir);
    await fs.mkdir(absDir, { recursive: true });
    const absPath = path.join(absDir, name);
    await fs.writeFile(absPath, '', 'utf-8');
    return this.rel(absPath);
  }

  async createDirectory(parentDir: string, name: string): Promise<string> {
    const absDir = this.abs(parentDir);
    const absPath = path.join(absDir, name);
    await fs.mkdir(absPath, { recursive: true });
    return this.rel(absPath);
  }

  /** Get parent directory path of a file. */
  parentDir(filePath: string): string {
    const parts = filePath.replace(/\\/g, SEP).replace(/\/+$/, '').split(SEP).filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : SEP + parts.join(SEP);
  }

  /** Get just the name from a path. */
  baseName(filePath: string): string {
    const parts = filePath.replace(/\\/g, SEP).replace(/\/+$/, '').split(SEP).filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  /** Check if a path is a directory. */
  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.abs(filePath));
      return stat.isDirectory();
    } catch { return false; }
  }

  /** Copy a file or directory entry to a destination directory. Returns the new path. */
  async copyEntry(srcPath: string, destDir: string): Promise<string> {
    const srcName = this.baseName(srcPath);
    const destPath = `${destDir}/${srcName}`;
    const srcAbs = this.abs(srcPath);
    const destAbs = this.abs(destPath);
    const stat = await fs.stat(srcAbs);
    if (stat.isDirectory()) {
      await this._copyDirRecursive(srcAbs, destAbs);
    } else {
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.copyFile(srcAbs, destAbs);
    }
    return destPath;
  }

  private async _copyDirRecursive(srcAbs: string, destAbs: string): Promise<void> {
    await fs.mkdir(destAbs, { recursive: true });
    const entries = await fs.readdir(srcAbs, { withFileTypes: true });
    for (const entry of entries) {
      const srcChild = path.join(srcAbs, entry.name);
      const destChild = path.join(destAbs, entry.name);
      if (entry.isDirectory()) {
        await this._copyDirRecursive(srcChild, destChild);
      } else {
        await fs.copyFile(srcChild, destChild);
      }
    }
  }
}
