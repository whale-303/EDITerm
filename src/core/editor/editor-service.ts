import { register, getService } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import { TextBuffer } from './text-buffer.js';
import type { TextEdit, TextPosition } from '../../types/index.js';
import type { IEventBus } from '../events/event-bus.js';

export interface IEditorService {
  // ── Buffer management ─────────────────────────
  open(path: string): Promise<void>;
  close(path: string): void;
  getBuffer(path: string): TextBuffer | undefined;
  getCursor(path: string): TextPosition;
  setCursor(path: string, pos: TextPosition): void;
  edit(path: string, edit: TextEdit): void;
  readonly activePath: string | null;

  // ── Dirty tracking ────────────────────────────
  /** Check if a file has unsaved changes. */
  isDirty(path: string): boolean;
  /** Mark a file as clean (content matches disk). */
  markClean(path: string): void;
  /** Mark a file as dirty. Optionally store its cached content. */
  markDirty(path: string, cachedContent?: string): void;
  /** Get cached dirty content for a non-active file, or undefined. */
  getDirtyCache(path: string): string | undefined;
  /** Store cached dirty content (when switching away from a dirty file). */
  setDirtyCache(path: string, content: string): void;
  /** Get the baseline loaded content for conflict detection. */
  getLoadedContent(path: string): string | undefined;
  /** Set the baseline loaded content. */
  setLoadedContent(path: string, content: string): void;
  /** Remove all tracking for a path. */
  removeTracking(path: string): void;

  // ── React integration ────────────────────────
  onChange(fn: () => void): () => void;
}

export class EditorService implements IEditorService {
  private buffers = new Map<string, TextBuffer>();
  private cursors = new Map<string, TextPosition>();
  private _activePath: string | null = null;

  // Dirty tracking
  private _dirtyFiles = new Set<string>();
  private _dirtyCache = new Map<string, string>();
  private _loadedContent = new Map<string, string>();

  // Change listeners (for React re-render)
  private _listeners = new Set<() => void>();

  // ── Buffer ──────────────────────────────────────

  get activePath(): string | null {
    return this._activePath;
  }

  async open(path: string): Promise<void> {
    if (this.buffers.has(path)) {
      this._activePath = path;
      this._notify();
      return;
    }
    const content = '';
    this.buffers.set(path, new TextBuffer(content));
    this.cursors.set(path, { row: 0, col: 0 });
    this._activePath = path;
    this._notify();

    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('file:opened', { path });
    } catch { /* EventBus not yet registered */ }
  }

  close(path: string): void {
    this.buffers.delete(path);
    this.cursors.delete(path);
    this._dirtyFiles.delete(path);
    this._dirtyCache.delete(path);
    this._loadedContent.delete(path);
    if (this._activePath === path) {
      this._activePath = this.buffers.keys().next().value ?? null;
    }
    this._notify();
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

  // ── Dirty tracking ────────────────────────────────

  isDirty(path: string): boolean {
    return this._dirtyFiles.has(path);
  }

  markClean(path: string): void {
    this._dirtyFiles.delete(path);
    this._dirtyCache.delete(path);
    this._notify();
    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('dirty:changed', { path, isDirty: false });
    } catch { /* */ }
  }

  markDirty(path: string, cachedContent?: string): void {
    this._dirtyFiles.add(path);
    if (cachedContent !== undefined) {
      this._dirtyCache.set(path, cachedContent);
    }
    this._notify();
    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('dirty:changed', { path, isDirty: true });
    } catch { /* */ }
  }

  getDirtyCache(path: string): string | undefined {
    return this._dirtyCache.get(path);
  }

  setDirtyCache(path: string, content: string): void {
    this._dirtyCache.set(path, content);
  }

  getLoadedContent(path: string): string | undefined {
    return this._loadedContent.get(path);
  }

  setLoadedContent(path: string, content: string): void {
    this._loadedContent.set(path, content);
  }

  removeTracking(path: string): void {
    this._dirtyFiles.delete(path);
    this._dirtyCache.delete(path);
    this._loadedContent.delete(path);
  }

  // ── React integration ──────────────────────────

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.EditorService, () => new EditorService());
