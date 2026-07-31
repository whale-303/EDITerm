/**
 * ContributionHost — central orchestrator for the contribution system.
 *
 * Owns all registries and provides the top-level bootstrap / dispatch API.
 * Registered as a DI singleton so any module can access it.
 *
 * This replaces:
 *   - Manual inputStack.push/pop in app.tsx (→ InputHandlerRegistry)
 *   - 6 useLayoutEffect focus blocks (→ PopupRegistry)
 *   - Hardcoded FocusTarget union (→ FocusTargetRegistry)
 *   - Hardcoded when-condition resolve() (→ ContextKeyRegistry)
 *   - Scattered useEffect bootstrap blocks (→ LifecycleRegistry)
 *   - Hardcoded panel layout in AppShell (→ PanelRegistry)
 */

import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import { InputHandlerRegistry } from './input-handler-registry.js';
import { PopupRegistry } from './popup-registry.js';
import { ContextKeyRegistry } from './context-key-registry.js';
import { FocusTargetRegistry } from './focus-target-registry.js';
import { LifecycleRegistry } from './lifecycle-registry.js';
import { PanelRegistry } from './panel-registry.js';
import type { WhenContext } from './types.js';
import type { Key } from '../../ui/hooks/input-stack.js';

export class ContributionHost {
  readonly inputHandlers = new InputHandlerRegistry();
  readonly popups = new PopupRegistry();
  readonly contextKeys = new ContextKeyRegistry();
  readonly focusTargets = new FocusTargetRegistry();
  readonly lifecycle = new LifecycleRegistry();
  readonly panels = new PanelRegistry();

  // ── Bootstrap ──────────────────────────────────────────

  /** Run all onBootstrap lifecycle hooks. Call once at app startup. */
  async bootstrap(): Promise<void> {
    await this.lifecycle.runBootstrap();
  }

  /** Notify lifecycle hooks of workspace change. */
  async onWorkspaceChanged(path: string, isRemote: boolean): Promise<void> {
    await this.lifecycle.runWorkspaceChange(path, isRemote);
  }

  /** Notify lifecycle hooks before shutdown. */
  async shutdown(): Promise<void> {
    await this.lifecycle.runBeforeQuit();
  }

  // ── Context ────────────────────────────────────────────

  /** Build the current WhenContext from all context-key providers. */
  buildContext(): WhenContext {
    return this.contextKeys.buildContext();
  }

  // ── Input dispatch ─────────────────────────────────────

  /**
   * Dispatch keyboard input through all registered input handlers.
   * Handlers are filtered by their `when` condition against the current
   * context, then tried in priority-descending order.
   *
   * @returns true if a handler consumed the input.
   */
  dispatchInput(input: string, key: Key): boolean {
    const ctx = this.buildContext();
    return this.inputHandlers.dispatch(input, key, ctx);
  }

  // ── Focus routing (popup-driven) ──────────────────────

  /**
   * Get the current focus target based on active popups.
   * If a popup is active, it gets focus. Otherwise falls back to the
   * provided default ('sidebar' or 'editor' based on mode).
   */
  getActiveFocusTarget(defaultFocus: 'sidebar' | 'editor'): string {
    const top = this.popups.getTopmostPopup();
    if (top) return top.id;
    return defaultFocus;
  }

  /**
   * Get the focus target to restore when a popup closes.
   */
  getRestoreFocusTarget(closedPopupId: string, defaultFocus: 'sidebar' | 'editor'): string {
    return this.popups.getRestoreTarget(closedPopupId, defaultFocus);
  }
}

// Self-register as DI singleton (same pattern as all other services)
register(TOKENS.ContributionHost, () => new ContributionHost());
