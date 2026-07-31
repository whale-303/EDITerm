/**
 * PanelRegistry — manages UI panel contributions.
 *
 * Panels are grouped by layout slot ('left', 'main', 'overlay', 'bottom').
 * AppShell queries panels by slot and renders them, eliminating the hardcoded
 * SidebarPanel / EditorPanel / OverlayLayer / StatusBarPanel composition.
 */

import type { IPanelContribution, PanelSlot, WhenContext } from './types.js';

export class PanelRegistry {
  private _panels: IPanelContribution[] = [];

  /** Register a panel contribution. Returns an unregister function. */
  register(panel: IPanelContribution): () => void {
    this._panels.push(panel);
    this._panels.sort((a, b) => a.priority - b.priority);
    return () => {
      const idx = this._panels.indexOf(panel);
      if (idx >= 0) this._panels.splice(idx, 1);
    };
  }

  /** Get panels for a specific slot, filtered by `when` condition. */
  getBySlot(slot: PanelSlot, ctx?: WhenContext): ReadonlyArray<IPanelContribution> {
    return this._panels.filter((p) => {
      if (p.slot !== slot) return false;
      if (p.when && ctx) return this._evalWhen(p.when, ctx);
      return true;
    });
  }

  /** All registered panels (unsorted, no filtering). */
  getAll(): ReadonlyArray<IPanelContribution> {
    return this._panels;
  }

  // ── internal ──────────────────────────────────────────

  private _evalWhen(when: string, ctx: WhenContext): boolean {
    if (!when || when === 'global') return true;
    const parts = when.split('&&').map((s) => s.trim());
    return parts.every((part) => {
      const eq = part.match(/^(\S+)==(.+)$/);
      if (eq) return ctx.resolve(eq[1]) === eq[2];
      const neq = part.match(/^(\S+)!=(.+)$/);
      if (neq) return ctx.resolve(neq[1]) !== neq[2];
      return ctx.resolve(part) === 'true';
    });
  }
}
