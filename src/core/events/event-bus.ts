/**
 * EventBus — typed pub/sub for loose coupling between services.
 *
 * Services emit domain events; extensions and other services subscribe.
 * Registered as a DI singleton via TOKENS.EventBus.
 */
import { register } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';

// ── Event type map ──────────────────────────────────────
// Every event name maps to a payload type. Add new events here.

export interface EventMap {
  'file:opened':        { path: string };
  'file:saved':         { path: string };
  'file:deleted':       { path: string };
  'file:renamed':       { oldPath: string; newPath: string };
  'file:created':       { path: string };
  'mode:changed':       { from: string; to: string; vimFrom?: string; vimTo?: string };
  'focus:changed':      { from: string; to: string };
  'workspace:changed':  { path: string; isRemote: boolean };
  'dirty:changed':      { path: string; isDirty: boolean };
  'notify:added':       { id: number; message: string };
  'notify:dismissed':   { id: number };
  'prompt:open':        { id: number; title: string };
  'prompt:closed':      { id: number };
  'tree:refreshed':     void;
  'before:quit':        void;
}

type EventName = keyof EventMap;

export type Unsubscribe = () => void;

// ── Interface ────────────────────────────────────────────

export interface IEventBus {
  /** Emit an event to all subscribers. */
  emit<K extends EventName>(event: K, payload: EventMap[K]): void;

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): Unsubscribe;

  /** Subscribe once — auto-unsubscribes after first fire. */
  once<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): Unsubscribe;

  /** Remove all listeners for an event (or all events). */
  clear(event?: EventName): void;
}

// ── Implementation ──────────────────────────────────────

export class EventBus implements IEventBus {
  private listeners = new Map<EventName, Set<(payload: any) => void>>();

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const fn of handlers) {
      fn(payload);
    }
  }

  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) this.listeners.delete(event);
    };
  }

  once<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void): Unsubscribe {
    const wrapped: any = (payload: EventMap[K]) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(event, wrapped);
    return unsubscribe;
  }

  clear(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// ── DI registration ─────────────────────────────────────

register(TOKENS.EventBus, () => new EventBus());
