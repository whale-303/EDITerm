/**
 * FocusService — focus target state machine.
 *
 * F3 cycles between available targets. Available targets depend on current
 * mode and whether popups (menu/notify/prompt) are open.
 *
 * Registered as DI singleton via TOKENS.FocusService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IFocusService, FocusTarget } from './ifocus-service.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';

export type { FocusTarget };

export class FocusService implements IFocusService {
  private _current: FocusTarget = 'sidebar';
  private _listeners = new Set<() => void>();

  constructor() {
    // Register context key + focus targets with ContributionHost
    const self = this;
    try {
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      host.contextKeys.register({
        resolve: (key: string) => {
          if (key === 'focus') return self._current;
          return undefined;
        },
      });
      // Base focus targets — always available
      host.focusTargets.register({
        id: 'sidebar',
        isAvailable: () => true, // always cyclable
        order: 1,
      });
      host.focusTargets.register({
        id: 'editor',
        isAvailable: () => true,
        order: 2,
      });
    } catch { /* ContributionHost not yet available */ }
  }

  get current(): FocusTarget {
    return this._current;
  }

  set(target: FocusTarget): void {
    if (this._current === target) return;
    this._current = target;
    this._notify();
  }

  cycle(): FocusTarget {
    const available = this._computeAvailable();
    if (available.length === 0) return this._current;

    const idx = available.indexOf(this._current);
    const next = available[(idx + 1) % available.length];
    if (next !== this._current) {
      this._current = next;
      this._notify();
    }
    return this._current;
  }

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  /** Compute which targets F3 can cycle through using the FocusTargetRegistry. */
  private _computeAvailable(): FocusTarget[] {
    try {
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      return host.focusTargets.getAvailable().map((t) => t.id as FocusTarget);
    } catch {
      return ['sidebar', 'editor'];
    }
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.FocusService, () => new FocusService());
