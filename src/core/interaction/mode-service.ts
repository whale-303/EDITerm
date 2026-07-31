/**
 * ModeService — DI-compatible wrapper around ModeManager.
 *
 * Registered as a singleton so all parts of the app share the same
 * mode state machine without prop-drilling.
 */
import { register, getService } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import type { IEventBus } from '../events/event-bus.js';
import { ModeManager } from './mode-manager.js';
import type { EditorMode, VimSubMode, ModeChangeEvent, ModeChangeListener } from './mode-manager.js';
import type { ContributionHost } from '../contributions/contribution-host.js';

// Re-export types for convenience
export type { EditorMode, VimSubMode, ModeChangeEvent, ModeChangeListener };

export interface IModeService {
  readonly mode: EditorMode;
  readonly vimSubMode: VimSubMode;
  tryTransition(key: string): boolean;
  setMode(mode: EditorMode): void;
  onModeChange(fn: ModeChangeListener): () => void;
  onChange(fn: () => void): () => void;
}

export class ModeService implements IModeService {
  private inner = new ModeManager();

  constructor() {
    try {
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      host.contextKeys.register({
        resolve: (key: string) => {
          if (key === 'mode') return this.inner.mode;
          return undefined;
        },
      });
    } catch { /* ContributionHost not yet available */ }
  }

  get mode(): EditorMode {
    return this.inner.mode;
  }

  get vimSubMode(): VimSubMode {
    return this.inner.vimSubMode;
  }

  tryTransition(key: string): boolean {
    const prev = this.inner.mode;
    const result = this.inner.tryTransition(key);
    if (result) {
      // Emit mode:changed event through EventBus
      try {
        const bus = getService<IEventBus>(TOKENS.EventBus);
        bus.emit('mode:changed', {
          from: prev,
          to: this.inner.mode,
          vimFrom: undefined,
          vimTo: this.inner.mode === 'vim' ? this.inner.vimSubMode : undefined,
        });
      } catch { /* EventBus not yet available */ }
    }
    return result;
  }

  setMode(mode: EditorMode): void {
    const prev = this.inner.mode;
    this.inner.setMode(mode);
    try {
      const bus = getService<IEventBus>(TOKENS.EventBus);
      bus.emit('mode:changed', {
        from: prev,
        to: mode,
      });
    } catch { /* EventBus not yet available */ }
  }

  onModeChange(fn: ModeChangeListener): () => void {
    return this.inner.onModeChange(fn);
  }

  /** Generic onChange for React useService hook (re-uses ModeManager listeners). */
  onChange(fn: () => void): () => void {
    return this.inner.onModeChange(() => fn());
  }
}

register(TOKENS.ModeService, () => new ModeService());
