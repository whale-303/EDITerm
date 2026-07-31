/**
 * ClipboardService — internal file clipboard for copy/cut/paste operations.
 * Registered as DI singleton via TOKENS.ClipboardService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IClipboardService, ClipboardEntry } from './iclipboard-service.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';

export type { ClipboardEntry };

export class ClipboardService implements IClipboardService {
  private _entry: ClipboardEntry | null = null;

  constructor() {
    try {
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      host.contextKeys.register({
        resolve: (key: string) => {
          if (key === 'clipboard.hasContent') return this.hasContent ? 'true' : 'false';
          return undefined;
        },
      });
    } catch { /* ContributionHost not yet available */ }
  }

  get entry(): ClipboardEntry | null {
    return this._entry;
  }

  get hasContent(): boolean {
    return this._entry !== null;
  }

  copy(path: string): void {
    this._entry = { path, cut: false };
  }

  cut(path: string): void {
    this._entry = { path, cut: true };
  }

  clear(): void {
    this._entry = null;
  }
}

register(TOKENS.ClipboardService, () => new ClipboardService());
