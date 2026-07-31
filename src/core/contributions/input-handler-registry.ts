/**
 * InputHandlerRegistry — manages keyboard input handlers contributed by features.
 *
 * Unlike the LIFO inputStack, this registry uses explicit priority ordering
 * and evaluates `when` conditions against the current context to determine
 * which handlers are active on each dispatch.
 */

import type { IInputHandler, WhenContext } from './types.js';
import type { Key } from '../../ui/hooks/input-stack.js';

interface HandlerEntry {
  handler: IInputHandler;
  /** resolved handler function (rebuilt when deps change) */
  fn: ((input: string, key: Key) => boolean) | null;
}

export class InputHandlerRegistry {
  private _handlers = new Map<string, HandlerEntry>();

  /** Register or replace an input handler. */
  register(handler: IInputHandler): () => void {
    this._handlers.set(handler.id, { handler, fn: null });
    return () => this._handlers.delete(handler.id);
  }

  /** Remove a handler by id. */
  unregister(id: string): void {
    this._handlers.delete(id);
  }

  /** True if a handler with the given id is registered. */
  has(id: string): boolean {
    return this._handlers.has(id);
  }

  /**
   * Get all registered handler descriptors, sorted by priority descending
   * (highest priority first). Useful for debugging / palette display.
   */
  getAll(): ReadonlyArray<IInputHandler> {
    return [...this._handlers.values()]
      .map((e) => e.handler)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Dispatch input to the first matching handler (by priority, filtered by `when`).
   * @returns true if a handler consumed the input.
   */
  dispatch(input: string, key: Key, ctx: WhenContext): boolean {
    // Collect matching handlers, sorted by priority descending
    const active: IInputHandler[] = [];
    for (const entry of this._handlers.values()) {
      if (this._evalWhen(entry.handler.when, ctx)) {
        active.push(entry.handler);
      }
    }
    active.sort((a, b) => b.priority - a.priority);

    for (const handler of active) {
      if (handler.handle(input, key, ctx)) return true;
    }
    return false;
  }

  // ── internal ──────────────────────────────────────────

  private _evalWhen(when: string | undefined, ctx: WhenContext): boolean {
    if (!when || when === 'global') return true;

    const parts = when.split('&&').map((s) => s.trim());
    return parts.every((part) => {
      const eqMatch = part.match(/^(\S+)==(.+)$/);
      if (eqMatch) return ctx.resolve(eqMatch[1]) === eqMatch[2];

      const neqMatch = part.match(/^(\S+)!=(.+)$/);
      if (neqMatch) return ctx.resolve(neqMatch[1]) !== neqMatch[2];

      // Single-word — treat as boolean
      return ctx.resolve(part) === 'true';
    });
  }
}
