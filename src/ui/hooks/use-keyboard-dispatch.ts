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
import type { IModeService } from '../../core/interaction/mode-service.js';
import type { IWorkspaceService } from '../../services/workspace/iworkspace-service.js';
import type { IClipboardService } from '../../services/clipboard/iclipboard-service.js';
import type { Command } from '../../types/index.js';

// ── When condition evaluator ──────────────────────

interface WhenContext {
  focus: string;
  mode: string;
  sidebarPath: string;
  clipboardHasContent: boolean;
}

function evalWhen(when: string | undefined, ctx: WhenContext): boolean {
  if (!when || when === 'global') return true;

  // Split by &&, trim each part, evaluate all
  const parts = when.split('&&').map((s) => s.trim());
  return parts.every((part) => evalSingleExpr(part, ctx));
}

function evalSingleExpr(expr: string, ctx: WhenContext): boolean {
  // Parse: key==value or key!=value
  const eqMatch = expr.match(/^(\w+)==(.+)$/);
  if (eqMatch) {
    const [, key, val] = eqMatch;
    return resolve(key, ctx) === val;
  }
  const neqMatch = expr.match(/^(\w+)!=(.+)$/);
  if (neqMatch) {
    const [, key, val] = neqMatch;
    return resolve(key, ctx) !== val;
  }
  // Single word — treat as boolean: true if non-empty/non-false
  return resolve(expr, ctx) === 'true';
}

function resolve(key: string, ctx: WhenContext): string {
  switch (key) {
    case 'focus':                return ctx.focus;
    case 'mode':                 return ctx.mode;
    case 'sidebarPath':          return ctx.sidebarPath;
    case 'clipboard.hasContent': return ctx.clipboardHasContent ? 'true' : 'false';
    default:                     return '';
  }
}

// ── Build context from DI services ────────────────

function buildWhenContext(): WhenContext {
  try {
    const focus = getService<IFocusService>(TOKENS.FocusService);
    const mode = getService<IModeService>(TOKENS.ModeService);
    const ws = getService<IWorkspaceService>(TOKENS.WorkspaceService);
    const clip = getService<IClipboardService>(TOKENS.ClipboardService);
    return {
      focus: focus.current,
      mode: mode.mode,
      sidebarPath: ws.sidebarPath,
      clipboardHasContent: clip.hasContent,
    };
  } catch {
    return { focus: 'sidebar', mode: 'normal', sidebarPath: '/', clipboardHasContent: false };
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

    // Try direct keybinding match first
    let cmd = registry.findByKeybinding(input);

    // Special key matching
    if (!cmd && key.escape) {
      cmd = registry.findByKeybinding('escape');
    }

    if (!cmd) return;

    // Evaluate when condition
    if (!evalWhen(cmd.when, ctx)) return;

    // Execute
    try {
      cmd.run({
        source: 'keyboard',
        target: { path: ctx.sidebarPath },
      });
    } catch (err) {
      // Silently ignore command errors (they should self-report via notify)
    }
  }, [registry]);

  useInput(dispatch);
}
