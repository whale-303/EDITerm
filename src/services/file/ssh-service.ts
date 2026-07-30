/**
 * SSHFileService — remote filesystem via node-ssh (SFTP + exec).
 * Implements IFileService so it's a drop-in swap for WorkspaceFileService.
 */
import { NodeSSH } from 'node-ssh';
import type { FileEntry } from '../../types/index.js';
import type { IFileService } from './ifile-service.js';

const SEP = '/';

export interface SSHConfig {
  host: string;        // user@host or just host
  port?: number;
  remoteRoot: string;  // e.g. /home/user/projects
  privateKey?: string;
  password?: string;
}

export class SSHFileService implements IFileService {
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

  get basePath(): string {
    return `${this._host}:${this._remoteRoot}`;
  }

  changeWorkspace(newPath: string): void {
    if (newPath.includes(':')) {
      const [host, ...rest] = newPath.split(':');
      this._host = host;
      this._remoteRoot = rest.join(':').replace(/\/+$/, '') || '/';
    } else {
      this._remoteRoot = newPath.replace(/\/+$/, '') || '/';
    }
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
    return this._remoteRoot + p;
  }

  parentDir(filePath: string): string {
    const parts = filePath.replace(/\\/g, SEP).replace(/\/+$/, '').split(SEP).filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : SEP + parts.join(SEP);
  }

  baseName(filePath: string): string {
    const parts = filePath.replace(/\\/g, SEP).replace(/\/+$/, '').split(SEP).filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  // ── Directory listing (exec) ──────────────────────

  async listDir(dirPath: string): Promise<FileEntry[]> {
    await this._ensureConnected();
    const remotePath = this._remote(dirPath);
    const { stdout } = await this._ssh.execCommand(
      `ls -1pA ${shEscape(remotePath)} 2>/dev/null | sort`,
      { encoding: 'utf8' },
    );
    const out = stdout as string;

    const result: FileEntry[] = [];
    for (const line of out.trim().split('\n')) {
      const name = line.replace(/\/$/, ''); // strip trailing / (dir indicator)
      if (!name) continue;
      const isDir = line.endsWith('/');
      const childPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const entry: FileEntry = { name, path: childPath, isDirectory: isDir };
      if (isDir) {
        entry.children = await this._listChildren(childPath);
      }
      result.push(entry);
    }
    result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
    return result;
  }

  private async _listChildren(parentPath: string): Promise<FileEntry[]> {
    try {
      const remotePath = this._remote(parentPath);
      const { stdout } = await this._ssh.execCommand(
        `ls -1pA ${shEscape(remotePath)} 2>/dev/null | sort`,
        { encoding: 'utf8' },
      );
      const out = stdout as string;
      const result: FileEntry[] = [];
      for (const line of out.trim().split('\n')) {
        const name = line.replace(/\/$/, '');
        if (!name) continue;
        const isDir = line.endsWith('/');
        const childPath = `${parentPath}/${name}`;
        const entry: FileEntry = { name, path: childPath, isDirectory: isDir };
        if (isDir) {
          entry.children = await this._listChildren(childPath);
        }
        result.push(entry);
      }
      result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
      return result;
    } catch {
      return [];
    }
  }

  // ── File read / write ─────────────────────────────

  async readFile(filePath: string): Promise<string> {
    await this._ensureConnected();
    const remotePath = this._remote(filePath);
    const result = await this._ssh.execCommand(`cat -- ${shEscape(remotePath)}`, { encoding: 'utf8' });
    if (result.code !== 0) throw new Error(result.stderr || 'readFile failed');
    return result.stdout as string;
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
      encoding: 'utf8',
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
    return parentDir === '/' ? `/${name}` : `${parentDir}/${name}`;
  }

  async createDirectory(parentDir: string, name: string): Promise<string> {
    await this._ensureConnected();
    const remoteDir = this._remote(parentDir);
    await this._ssh.execCommand(`mkdir -p ${shEscape(remoteDir + '/' + name)}`);
    return parentDir === '/' ? `/${name}` : `${parentDir}/${name}`;
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
