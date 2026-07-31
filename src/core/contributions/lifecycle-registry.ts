/**
 * LifecycleRegistry — manages application lifecycle hooks.
 *
 * Replaces the scattered useEffect blocks in app.tsx for bootstrap,
 * workspace changes, and shutdown. Hooks are registered at module
 * import time and executed in `order` sequence within each phase.
 */

import type { ILifecycleHook } from './types.js';

export class LifecycleRegistry {
  private _hooks: ILifecycleHook[] = [];

  /** Register a lifecycle hook. Returns an unregister function. */
  register(hook: ILifecycleHook): () => void {
    this._hooks.push(hook);
    this._hooks.sort((a, b) => a.order - b.order);
    return () => {
      const idx = this._hooks.indexOf(hook);
      if (idx >= 0) this._hooks.splice(idx, 1);
    };
  }

  /** Run all onBootstrap hooks in order. */
  async runBootstrap(): Promise<void> {
    for (const hook of this._hooks) {
      if (hook.onBootstrap) await hook.onBootstrap();
    }
  }

  /** Run all onWorkspaceChange hooks in order. */
  async runWorkspaceChange(path: string, isRemote: boolean): Promise<void> {
    for (const hook of this._hooks) {
      if (hook.onWorkspaceChange) await hook.onWorkspaceChange(path, isRemote);
    }
  }

  /** Run all onBeforeQuit hooks in order. */
  async runBeforeQuit(): Promise<void> {
    for (const hook of this._hooks) {
      if (hook.onBeforeQuit) await hook.onBeforeQuit();
    }
  }
}
