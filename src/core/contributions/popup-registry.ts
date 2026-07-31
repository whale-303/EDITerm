/**
 * PopupRegistry — manages the lifecycle of overlay popups.
 *
 * Replaces the 6 useLayoutEffect focus blocks and 5 useEffect push/pop blocks
 * in app.tsx. Popups register themselves with an id, priority, activation
 * predicate, and input handler. The registry determines focus routing.
 */

import type { IPopupProvider } from './types.js';

export class PopupRegistry {
  private _popups = new Map<string, IPopupProvider>();

  /** Register a popup provider. Returns an unregister function. */
  register(popup: IPopupProvider): () => void {
    this._popups.set(popup.id, popup);
    return () => this._popups.delete(popup.id);
  }

  /** Remove a popup by id. */
  unregister(id: string): void {
    this._popups.delete(id);
  }

  /** All registered popup descriptors. */
  getAll(): ReadonlyArray<IPopupProvider> {
    return [...this._popups.values()];
  }

  /**
   * Popups that are currently active, sorted by priority descending
   * (highest-priority popup first).
   */
  getActivePopups(): IPopupProvider[] {
    return this.getAll()
      .filter((p) => p.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * The topmost active popup (highest priority), or null if none.
   */
  getTopmostPopup(): IPopupProvider | null {
    return this.getActivePopups()[0] ?? null;
  }

  /** True if any popup is currently active. */
  isAnyOpen(): boolean {
    return this.getActivePopups().length > 0;
  }

  /**
   * Determine the focus target to restore to when `closedPopupId` closes.
   * Returns 'sidebar' or 'editor' if no higher-priority popup is still open.
   */
  getRestoreTarget(closedPopupId: string, defaultFocus: 'sidebar' | 'editor'): string {
    const remaining = this.getActivePopups().filter((p) => p.id !== closedPopupId);
    if (remaining.length > 0) {
      return remaining[0].id; // highest-priority remaining popup
    }
    return defaultFocus;
  }
}
