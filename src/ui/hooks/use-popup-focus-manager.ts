/**
 * usePopupFocusManager — single hook that replaces the 6 useLayoutEffect blocks
 * in app.tsx (3 × auto-focus-on-open + 3 × focus-restore-on-close).
 *
 * Subscribes to all popup services via useService. On any popup state change:
 * - If a popup opened → focus it
 * - If a popup closed and it was focused → restore to next active popup or fallback
 */

import { useLayoutEffect, useRef } from 'react';
import { useService, useEditorAPI } from './use-service.js';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';
import type { IMenuService } from '../../services/menu/imenu-service.js';
import type { INotifyService } from '../../services/notify/inotify-service.js';
import type { IPromptService } from '../../services/prompt/iprompt-service.js';
import type { ICompletionService } from '../../services/completion/icompletion-service.js';

/**
 * @param defaultFocus — 'sidebar' or 'editor' depending on current mode.
 *   Re-evaluated on every render, so pass is `modeSvc.mode === 'normal' ? 'sidebar' : 'editor'`.
 */
export function usePopupFocusManager(defaultFocus: 'sidebar' | 'editor'): void {
  const host = getService<ContributionHost>(TOKENS.ContributionHost);
  const focus = useService<IFocusService>(TOKENS.FocusService);

  // Subscribe to popup services so we re-render on state changes
  useService<IMenuService>(TOKENS.MenuService);
  useService<INotifyService>(TOKENS.NotifyService);
  useService<IPromptService>(TOKENS.PromptService);
  useService<ICompletionService>(TOKENS.CompletionService);

  // Track previous isActive state for each popup (id → wasActive)
  const prevRef = useRef<Record<string, boolean>>({});

  useLayoutEffect(() => {
    const popups = host.popups.getAll();
    const active = host.popups.getActivePopups();
    const topmost = active[0] ?? null;
    const prev = prevRef.current;

    // Build current state snapshot
    const current: Record<string, boolean> = {};
    for (const p of popups) current[p.id] = p.isActive;

    // ── Detect transitions ──────────────────────────
    for (const p of popups) {
      const was = prev[p.id] ?? false;
      const now = current[p.id];

      if (!was && now) {
        // Popup opened → focus it
        focus.set(p.id as any);
      } else if (was && !now) {
        // Popup closed — if it was focused, restore
        if (focus.current === p.id) {
          const restore = host.getRestoreFocusTarget(p.id, defaultFocus);
          focus.set(restore as any);
        }
      }
    }

    // If the topmost popup opened while nothing was previously active,
    // ensure it gets focus (catches the initial-open case).
    if (topmost && focus.current !== topmost.id && !active.some((a) => prev[a.id])) {
      focus.set(topmost.id as any);
    }

    prevRef.current = current;
  });
}
