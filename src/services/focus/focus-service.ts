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
import type { IModeService } from '../../core/interaction/mode-service.js';
import type { INotifyService } from '../notify/inotify-service.js';
import type { IMenuService } from '../menu/imenu-service.js';
import type { IPromptService } from '../prompt/iprompt-service.js';

export type { FocusTarget };

export class FocusService implements IFocusService {
  private _current: FocusTarget = 'sidebar';
  private _listeners = new Set<() => void>();

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

  /** Compute which targets F3 can cycle through based on current app state. */
  private _computeAvailable(): FocusTarget[] {
    const targets: FocusTarget[] = [];

    // Popups first if they're open
    try {
      const notify = getService<INotifyService>(TOKENS.NotifyService);
      if (notify.hasActionable) targets.push('notify');
    } catch { /* not yet registered */ }

    try {
      const menu = getService<IMenuService>(TOKENS.MenuService);
      if (menu.isOpen) targets.push('menu');
    } catch { /* not yet registered */ }

    try {
      const prompt = getService<IPromptService>(TOKENS.PromptService);
      if (prompt.isOpen) targets.push('prompt');
    } catch { /* not yet registered */ }

    // Mode-dependent target
    try {
      const mode = getService<IModeService>(TOKENS.ModeService);
      if (mode.mode === 'normal') {
        targets.push('sidebar');
      } else {
        targets.push('editor');
      }
    } catch {
      // Fallback: always include sidebar and editor
      targets.push('sidebar');
      targets.push('editor');
    }

    return targets;
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

register(TOKENS.FocusService, () => new FocusService());
