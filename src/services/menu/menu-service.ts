/**
 * MenuService — context menu state and keyboard navigation.
 * Registered as DI singleton via TOKENS.MenuService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IMenuService, MenuState, MenuItem } from './imenu-service.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';

export type { MenuState, MenuItem };

export class MenuService implements IMenuService {
  private _state: MenuState | null = null;
  private _highlightIndex = 0;
  private _listeners = new Set<() => void>();

  constructor() {
    try {
      const self = this;
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      host.contextKeys.register({
        resolve: (key: string) => {
          if (key === 'menu.isOpen') return self.isOpen ? 'true' : 'false';
          return undefined;
        },
      });
      host.popups.register({
        id: 'menu',
        get isActive() { return self._state !== null; },
        priority: 50,
      });
      host.focusTargets.register({
        id: 'menu',
        isAvailable: () => self._state !== null,
        order: 10,
      });
    } catch { /* ContributionHost not yet available */ }
  }

  get state(): MenuState | null {
    return this._state;
  }

  get isOpen(): boolean {
    return this._state !== null;
  }

  get highlightIndex(): number {
    return this._highlightIndex;
  }

  show(x: number, y: number, items: MenuItem[]): void {
    this._state = { x, y, items };
    this._highlightIndex = 0;
    this._notify();
  }

  close(): void {
    this._state = null;
    this._highlightIndex = 0;
    this._notify();
  }

  moveHighlight(delta: number): void {
    if (!this._state) return;
    const max = Math.max(0, (this._state.items.length || 1) - 1);
    this._highlightIndex = Math.max(0, Math.min(max, this._highlightIndex + delta));
    this._notify();
  }

  setHighlight(index: number): void {
    this._highlightIndex = index;
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

register(TOKENS.MenuService, () => new MenuService());
