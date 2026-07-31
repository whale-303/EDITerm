/**
 * SSHFileService — remote filesystem via node-ssh (SFTP + exec).
 * Implements IVFSProvider so it can be mounted into the VFS.
 */
import { NodeSSH } from 'node-ssh';
import type { FileEntry } from '../../types/index.js';
import type { IVFSProvider, ExecResult } from './ivfs-provider.js';

const SEP = '/';

export interface SSHConfig {
  host: string;        // user@host or just host
  port?: number;
  remoteRoot: string;  // e.g. /home/user/projects
  privateKey?: string;
  password?: string;
}

export class SSHFileService implements IVFSProvider {
  private _ssh: NodeSSH;
  private _host: string;
  private _port: number;
  private _remoteRoot: string;
  private _privateKey?: string;
  private _password?: string;
  private _connected = false;

  constructor(config: SSHConfig) {
    this._ssh = new NodeSSH();
    this._host = config.host;
    this._port = config.port ?? 22;
    this._remoteRoot = config.remoteRoot.replace(/\/+$/, '') || '/';
    this._privateKey = config.privateKey;
    this._password = config.password;
  }

  /** Provider label for VFS mount listing. */
  get label(): string {
    return `ssh://${this._host}${this._remoteRoot}`;
  }

  /** Display path (kept for workspace:changed event). */
  get basePath(): string {
    return `${this._host}:${this._remoteRoot}`;
  }

  // ── Connection ────────────────────────────────────

  private async _ensureConnected(): Promise<void> {
    if (this._connected) return;
    // Parse user@host
    let username = '';
    let hostname = this._host;
    if (this._host.includes('@')) {
      [username, hostname] = this._host.split('@');
    }

    await this._ssh.connect({
      host: hostname,
      port: this._port,
      username: username || undefined,
      privateKey: this._privateKey,
      password: this._password,
      readyTimeout: 10_000,
      strict: false,
    });
    this._connected = true;
  }

  /** Release the SSH connection. */
  async disconnect(): Promise<void> {
    if (this._connected) {
      this._ssh.dispose();
      this._connected = false;
    }
  }

  /** Convert a provider-relative path to a full remote path. */
  toNativePath(relPath: string): string | null {
    return this._remote(relPath);
  }

  /** Convert a full remote path back to a provider-relative path. */
  fromNativePath(nativePath: string): string | null {
    const root = this._remoteRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = nativePath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === root) return '';
    if (normalized.startsWith(root + '/')) {
      return normalized.slice(root.length + 1);
    }
    return null; // not within this remote root
  }

  /** Execute a shell command on the remote server. Defaults cwd to remoteRoot. */
  async execCommand(command: string, options?: { cwd?: string }): Promise<ExecResult> {
    await this._ensureConnected();
    // Use the specified cwd, or fall back to the configured remoteRoot
    const cwd = options?.cwd ?? this._remoteRoot;
    const cmd = `cd ${shEscape(cwd)} && ${command}`;
    const result = await this._ssh.execCommand(cmd);
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      code: result.code ?? null,
    };
  }

  // ── Path helpers ──────────────────────────────────

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

  private _remote(p: string): string {
    // Normalize: join root and sub-path without double or trailing slashes
    const root = this._remoteRoot.replace(/\/+$/, '');
    const sub = p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    return sub ? `${root}/${sub}` : root;
  }

  parentDir(filePath: string): string {
    const cleaned = filePath.replace(/\\/g, SEP).replace(/\/+$/, '');
    if (cleaned === '' || cleaned === '/') return '';
    const parts = cleaned.split(SEP).filter(Boolean);
    parts.pop();
    return parts.join(SEP);
  }

  baseName(filePath: string): string {
    const cleaned = filePath.replace(/\\/g, SEP).replace(/\/+$/, '');
    if (cleaned === '' || cleaned === '/') return '';
    const parts = cleaned.split(SEP).filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  // ── Directory listing (exec) ──────────────────────

  async listDir(dirPath: string): Promise<FileEntry[]> {
    await this._ensureConnected();
    const remotePath = this._remote(dirPath);
    const result = await this._ssh.execCommand(
      `ls -1pA ${shEscape(remotePath)} 2>/dev/null | sort`,
    );
    const out = String(result.stdout ?? '');

    const entries: FileEntry[] = [];
    const isRoot = dirPath === '/' || dirPath === '';
    for (const line of out.trim().split('\n')) {
      const name = line.replace(/\/$/, '');
      if (!name) continue;
      const isDir = line.endsWith('/');
      const childPath = isRoot ? `/${name}` : `/${dirPath}/${name}`;
      entries.push({ name, path: childPath, isDirectory: isDir });
      // children NOT populated — lazy loaded on expand
    }
    entries.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
    return entries;
  }

  // ── File read / write ─────────────────────────────

  async readFile(filePath: string): Promise<string> {
    await this._ensureConnected();
    const remotePath = this._remote(filePath);
    const result = await this._ssh.execCommand(`cat -- ${shEscape(remotePath)}`);
    if (result.code !== 0) throw new Error(String(result.stderr || 'readFile failed'));
    return String(result.stdout ?? '');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this._ensureConnected();
    const remotePath = this._remote(filePath);
    // Ensure parent exists
    const parent = remotePath.replace(/\/[^/]*$/, '') || '/';
    await this._ssh.execCommand(`mkdir -p ${shEscape(parent)}`);
    // Write via stdin
    await this._ssh.execCommand(`cat > ${shEscape(remotePath)}`, {
      stdin: content,
    });
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this._ensureConnected();
      const remotePath = this._remote(filePath);
      const r = await this._ssh.execCommand(`test -e ${shEscape(remotePath)}`);
      return r.code === 0;
    } catch {
      return false;
    }
  }

  // ── Mutations ─────────────────────────────────────

  async delete(filePath: string): Promise<void> {
    await this._ensureConnected();
    const remotePath = this._remote(filePath);
    await this._ssh.execCommand(`rm -rf ${shEscape(remotePath)}`);
  }

  async rename(oldPath: string, newName: string): Promise<string> {
    await this._ensureConnected();
    const oldRemote = this._remote(oldPath);
    const dir = oldRemote.replace(/\/[^/]*$/, '');
    const newRemote = `${dir}/${newName}`;
    await this._ssh.execCommand(`mv ${shEscape(oldRemote)} ${shEscape(newRemote)}`);
    const vDir = oldPath.replace(/\/[^/]*$/, '');
    return vDir ? `${vDir}/${newName}` : `/${newName}`;
  }

  async createFile(parentDir: string, name: string): Promise<string> {
    await this._ensureConnected();
    const remoteDir = this._remote(parentDir);
    await this._ssh.execCommand(`mkdir -p ${shEscape(remoteDir)} && touch ${shEscape(remoteDir + '/' + name)}`);
    return (parentDir === '/' || parentDir === '') ? name : `${parentDir}/${name}`;
  }

  async createDirectory(parentDir: string, name: string): Promise<string> {
    await this._ensureConnected();
    const remoteDir = this._remote(parentDir);
    await this._ssh.execCommand(`mkdir -p ${shEscape(remoteDir + '/' + name)}`);
    return (parentDir === '/' || parentDir === '') ? name : `${parentDir}/${name}`;
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      await this._ensureConnected();
      const remotePath = this._remote(filePath);
      const r = await this._ssh.execCommand(`test -d ${shEscape(remotePath)}`);
      return r.code === 0;
    } catch {
      return false;
    }
  }

  async copyEntry(srcPath: string, destDir: string): Promise<string> {
    await this._ensureConnected();
    const srcRemote = this._remote(srcPath);
    const srcName = this.baseName(srcPath);
    const destRemote = this._remote(destDir);
    const destPath = `${destDir}/${srcName}`;
    await this._ssh.execCommand(`cp -r ${shEscape(srcRemote)} ${shEscape(destRemote + '/' + srcName)}`);
    return destPath;
  }
}

/** Shell-escape a string for safe use in a command. */
function shEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
