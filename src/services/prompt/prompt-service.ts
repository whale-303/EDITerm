/**
 * PromptService — modal text prompt.
 * Promise-based: open() returns a Promise that resolves on confirm/cancel.
 * Registered as DI singleton via TOKENS.PromptService.
 */
import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IPromptService, PromptState, PromptOptions } from './iprompt-service.js';

export type { PromptState, PromptOptions };

export class PromptService implements IPromptService {
  private _state: PromptState | null = null;
  private _resolve: ((value: string | null) => void) | null = null;
  private _listeners = new Set<() => void>();

  get isOpen(): boolean {
    return this._state !== null;
  }

  get state(): PromptState | null {
    return this._state;
  }

  open(title: string, opts: PromptOptions = {}): Promise<string | null> {
    // Resolve any previous pending promise (cancel it)
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }

    return new Promise<string | null>((resolve) => {
      this._resolve = resolve;
      this._state = {
        title,
        defaultValue: opts.defaultValue ?? '',
        password: opts.password ?? false,
      };
      this._notify();
    });
  }

  /** Confirm with a value. Called by the prompt input handler. */
  confirm(value: string): void {
    if (!this._resolve) return;
    const resolve = this._resolve;
    this._state = null;
    this._resolve = null;
    resolve(value);
    this._notify();
  }

  /** Cancel the current prompt. */
  close(): void {
    if (!this._resolve) return;
    const resolve = this._resolve;
    this._state = null;
    this._resolve = null;
    resolve(null);
    this._notify();
  }

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.PromptService, () => new PromptService());
