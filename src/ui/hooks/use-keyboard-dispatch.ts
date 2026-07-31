/**
 * useKeyboardDispatch — routes keyboard input to registered commands.
 *
 * Replaces the monolithic hardcoded handler in app.tsx with a
 * command-registry-based dispatch. Input flows:
 *
 *   useInput → dispatch → CommandRegistry.findByKeybinding → evaluate when → execute
 *
 * Popup-focused input (menu/notify/prompt) bypasses command dispatch entirely.
 */
import { useCallback } from 'react';
import { useInput } from 'ink';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ICommandRegistry } from '../../core/commands/command-registry.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';
import type { IWorkspaceService } from '../../services/workspace/iworkspace-service.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';
import type { WhenContext } from '../../core/contributions/types.js';
import type { Command } from '../../types/index.js';

// ── When condition evaluator ──────────────────────

function buildWhenContext(): WhenContext {
  try {
    const host = getService<ContributionHost>(TOKENS.ContributionHost);
    return host.buildContext();
  } catch {
    // Fallback: empty context for early bootstrap before host is ready
    return { resolve: () => '' };
  }
}

// ── Hook ──────────────────────────────────────────

/**
 * Bridge Ink's useInput to the CommandRegistry.
 *
 * Call this once in app.tsx. It intercepts all keyboard input and
 * dispatches to matching commands. Popup-focused input is not dispatched
 * (menu/notify/prompt have their own input handlers).
 */
export function useKeyboardDispatch(): void {
  const registry = getService<ICommandRegistry>(TOKENS.CommandRegistry);

  const dispatch = useCallback((input: string, key: { escape?: boolean; return?: boolean }) => {
    // Skip popup-focused input — popups manage their own input
    try {
      const focus = getService<IFocusService>(TOKENS.FocusService);
      if (focus.current === 'menu' || focus.current === 'notify' || focus.current === 'prompt') {
        return;
      }
    } catch { /* */ }

    const ctx = buildWhenContext();
    const host = getService<ContributionHost>(TOKENS.ContributionHost);

    // Try direct keybinding match first
    let cmd = registry.findByKeybinding(input);

    // Special key matching
    if (!cmd && key.escape) {
      cmd = registry.findByKeybinding('escape');
    }

    if (!cmd) return;

    // Evaluate when condition via ContextKeyRegistry
    if (!host.contextKeys.evalWhen(cmd.when, ctx)) return;

    // Execute
    try {
      cmd.run({
        source: 'keyboard',
        target: { path: ctx.resolve('sidebarPath') },
      });
    } catch (err) {
      // Silently ignore command errors (they should self-report via notify)
    }
  }, [registry]);

  useInput(dispatch);
}
