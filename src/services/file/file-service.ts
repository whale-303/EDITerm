import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { FileEntry } from '../../types/index.js';

export interface IFileService {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  listDir(dirPath: string): Promise<FileEntry[]>;
  exists(filePath: string): Promise<boolean>;
  resolve(...segments: string[]): string;
}

export class FileService implements IFileService {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return fs.writeFile(filePath, content, 'utf-8');
  }

  async listDir(dirPath: string): Promise<FileEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((d) => ({
      name: d.name,
      path: path.join(dirPath, d.name),
      isDirectory: d.isDirectory(),
    }));
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }
}

register(TOKENS.FileService, () => new FileService());
