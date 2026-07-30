/**
 * Virtual in-memory filesystem for development/testing.
 * Implements IFileService so the rest of the editor uses it transparently.
 */
import type { IFileService } from './file-service.js';
import type { FileEntry } from '../../types/index.js';

interface VNode {
  type: 'file' | 'directory';
  name: string;
  content?: string;
  children?: Map<string, VNode>;
}

const SEP = '/';

function splitPath(p: string): string[] {
  return p.replace(/\\/g, SEP).split(SEP).filter(Boolean);
}

// ── Test workspace tree ──────────────────────────────

function buildTestTree(): VNode {
  return {
    type: 'directory', name: '/', children: new Map([
      ['src', {
        type: 'directory', name: 'src', children: new Map([
          ['index.ts',    { type: 'file', name: 'index.ts',    content: 'export * from "./app.js";\nexport * from "./utils.js";\n' }],
          ['app.ts',      { type: 'file', name: 'app.ts',      content: 'import React from "react";\nimport { render } from "ink";\n\nrender(<App />);\n' }],
          ['utils.ts',    { type: 'file', name: 'utils.ts',    content: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function mul(a: number, b: number): number {\n  return a * b;\n}\n' }],
          ['components',  {
            type: 'directory', name: 'components', children: new Map([
              ['Button.tsx',  { type: 'file', name: 'Button.tsx',  content: 'import React from "react";\n\nexport const Button = () => <Text>Click</Text>;\n' }],
              ['Header.tsx',  { type: 'file', name: 'Header.tsx',  content: 'export const Header = () => null;\n' }],
            ]),
          }],
        ]),
      }],
      ['README.md',   { type: 'file', name: 'README.md',   content: '# Test Project\n\nA virtual workspace for EDITerm development.\n\n## Getting Started\n\n```bash\nnpm run dev\n```\n' }],
      ['package.json',{ type: 'file', name: 'package.json',content: '{\n  "name": "test-project",\n  "version": "1.0.0",\n  "dependencies": {\n    "ink": "^5.0.0",\n    "react": "^18.0.0"\n  }\n}\n' }],
      ['tsconfig.json',{type: 'file', name: 'tsconfig.json',content: '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "NodeNext",\n    "strict": true\n  }\n}\n' }],
      ['.gitignore',  { type: 'file', name: '.gitignore',  content: 'node_modules/\ndist/\n*.log\n' }],
    ]),
  };
}

// ── Virtual FS ────────────────────────────────────────

export class VirtualFileSystem implements IFileService {
  private root: VNode;

  constructor(tree?: VNode) {
    this.root = tree ?? buildTestTree();
  }

  async readFile(filePath: string): Promise<string> {
    const node = this._walk(filePath);
    if (!node || node.type !== 'file') throw new Error(`ENOENT: ${filePath}`);
    return node.content ?? '';
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const parts = splitPath(filePath);
    const name = parts.pop()!;
    const parent = this._walkDir(parts);
    if (!parent) throw new Error(`ENOENT: ${filePath}`);
    parent.children!.set(name, { type: 'file', name, content });
  }

  async listDir(dirPath: string): Promise<FileEntry[]> {
    const node = this._walk(dirPath);
    if (!node || node.type !== 'directory') throw new Error(`ENOTDIR: ${dirPath}`);
    const result: FileEntry[] = [];
    for (const [, child] of node.children ?? []) {
      const entry: FileEntry = {
        name: child.name,
        path: dirPath === '/' ? `/${child.name}` : `${dirPath}/${child.name}`,
        isDirectory: child.type === 'directory',
      };
      if (child.type === 'directory' && child.children) {
        entry.children = this._listChildren(entry.path, child);
      }
      result.push(entry);
    }
    // Sort: directories first, then alphabetical
    result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
    return result;
  }

  private _listChildren(parentPath: string, node: VNode): FileEntry[] {
    const result: FileEntry[] = [];
    for (const [, child] of node.children ?? []) {
      const childPath = `${parentPath}/${child.name}`;
      const entry: FileEntry = {
        name: child.name,
        path: childPath,
        isDirectory: child.type === 'directory',
      };
      if (child.type === 'directory' && child.children) {
        entry.children = this._listChildren(childPath, child);
      }
      result.push(entry);
    }
    result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name));
    return result;
  }

  async exists(filePath: string): Promise<boolean> {
    try { this._walk(filePath); return true; } catch { return false; }
  }

  resolve(...segments: string[]): string {
    const joined = segments.join(SEP).replace(/\\/g, SEP);
    const parts = splitPath(joined);
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') { resolved.pop(); continue; }
      resolved.push(p);
    }
    return '/' + resolved.join(SEP);
  }

  // ── Internal ──────────────────────────────────

  private _walk(filePath: string): VNode | null {
    const parts = splitPath(filePath);
    let node: VNode | undefined = this.root;
    for (const p of parts) {
      if (node.type !== 'directory' || !node.children) return null;
      node = node.children.get(p);
      if (!node) return null;
    }
    return node;
  }

  private _walkDir(parts: string[]): VNode | null {
    let node: VNode = this.root;
    for (const p of parts) {
      if (!node.children) return null;
      let child = node.children.get(p);
      if (!child) {
        child = { type: 'directory', name: p, children: new Map() };
        node.children.set(p, child);
      }
      if (child.type !== 'directory') return null;
      node = child;
    }
    return node;
  }
}
