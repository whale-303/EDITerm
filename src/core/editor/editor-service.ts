import { register, getService } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import { TextBuffer } from './text-buffer.js';
import type { TextEdit, TextPosition } from '../../types/index.js';

export interface IEditorService {
  open(path: string): Promise<void>;
  close(path: string): void;
  getBuffer(path: string): TextBuffer | undefined;
  getCursor(path: string): TextPosition;
  setCursor(path: string, pos: TextPosition): void;
  edit(path: string, edit: TextEdit): void;
  readonly activePath: string | null;
}

export class EditorService implements IEditorService {
  private buffers = new Map<string, TextBuffer>();
  private cursors = new Map<string, TextPosition>();
  private _activePath: string | null = null;

  get activePath(): string | null {
    return this._activePath;
  }

  async open(path: string): Promise<void> {
    if (this.buffers.has(path)) {
      this._activePath = path;
      return;
    }
    const content = '';
    this.buffers.set(path, new TextBuffer(content));
    this.cursors.set(path, { row: 0, col: 0 });
    this._activePath = path;
  }

  close(path: string): void {
    this.buffers.delete(path);
    this.cursors.delete(path);
    if (this._activePath === path) {
      this._activePath = this.buffers.keys().next().value ?? null;
    }
  }

  getBuffer(path: string): TextBuffer | undefined {
    return this.buffers.get(path);
  }

  getCursor(path: string): TextPosition {
    return this.cursors.get(path) ?? { row: 0, col: 0 };
  }

  setCursor(path: string, pos: TextPosition): void {
    const buf = this.buffers.get(path);
    if (buf) this.cursors.set(path, buf.clamp(pos));
  }

  edit(path: string, edit: TextEdit): void {
    this.buffers.get(path)?.applyEdit(edit);
  }
}

register(TOKENS.EditorService, () => new EditorService());
