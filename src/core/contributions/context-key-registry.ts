/**
 * ContextKeyRegistry — aggregates context-key providers for when-condition evaluation.
 *
 * Replaces the hardcoded 4-key `resolve()` in use-keyboard-dispatch.ts.
 * Services register themselves as providers of specific context keys.
 * The registry builds a complete WhenContext for dispatch-time evaluation.
 */

import type { IContextKeyProvider, WhenContext } from './types.js';

export class ContextKeyRegistry {
  private _providers: IContextKeyProvider[] = [];

  /** Register a context key provider. Returns an unregister function. */
  register(provider: IContextKeyProvider): () => void {
    this._providers.push(provider);
    return () => {
      const idx = this._providers.indexOf(provider);
      if (idx >= 0) this._providers.splice(idx, 1);
    };
  }

  /** Remove all registered providers. */
  clear(): void {
    this._providers = [];
  }

  /**
   * Build a WhenContext that delegates to all registered providers.
   * Providers are checked in registration order; the first non-undefined
   * result wins.
   */
  buildContext(): WhenContext {
    const providers = [...this._providers]; // snapshot for stable closure
    return {
      resolve(key: string): string {
        for (const p of providers) {
          const val = p.resolve(key);
          if (val !== undefined) return val;
        }
        return '';
      },
    };
  }

  /**
   * Evaluate a `when` expression string against the current context.
   * Supports:  `key==value`, `key!=value`, `key` (boolean), `&&` conjunction.
   */
  evalWhen(when: string | undefined, ctx: WhenContext): boolean {
    if (!when || when === 'global') return true;

    const parts = when.split('&&').map((s) => s.trim());
    return parts.every((part) => {
      const eqMatch = part.match(/^(\S+)==(.+)$/);
      if (eqMatch) return ctx.resolve(eqMatch[1]) === eqMatch[2];

      const neqMatch = part.match(/^(\S+)!=(.+)$/);
      if (neqMatch) return ctx.resolve(neqMatch[1]) !== neqMatch[2];

      return ctx.resolve(part) === 'true';
    });
  }
}
