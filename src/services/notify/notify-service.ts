/**
 * NotifyService — notification queue with auto-dismiss timers.
 * Registered as DI singleton via TOKENS.NotifyService.
 */
import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { INotifyService, NotifyItem, NotifyAction } from './inotify-service.js';

export type { NotifyItem, NotifyAction };

export class NotifyService implements INotifyService {
  private _items: NotifyItem[] = [];
  private _nextId = 0;
  private _timers = new Map<number, ReturnType<typeof setTimeout>>();
  private _listeners = new Set<() => void>();

  get items(): ReadonlyArray<NotifyItem> {
    return this._items;
  }

  get hasActionable(): boolean {
    return this._items.some((n) => n.actions.length > 0);
  }

  add(message: string, actions: NotifyAction[] = [], timeout?: number): number {
    const id = ++this._nextId;
    const item: NotifyItem = { id, message, actions, timeout };
    this._items = [...this._items, item];
    this._notify();

    // Auto-dismiss timer
    const t = timeout ?? 0;
    if (t > 0) {
      const timer = setTimeout(() => this.dismiss(id), t);
      this._timers.set(id, timer);
    }
    return id;
  }

  dismiss(id: number): void {
    const timer = this._timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(id);
    }
    const idx = this._items.findIndex((n) => n.id === id);
    if (idx === -1) return;
    this._items = [...this._items.slice(0, idx), ...this._items.slice(idx + 1)];
    this._notify();
  }

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  /** Dispose all timers (call on app exit). */
  dispose(): void {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
    this._items = [];
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.NotifyService, () => new NotifyService());
