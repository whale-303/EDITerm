/**
 * React hooks for consuming DI services.
 *
 * useService<T>(token) — get a service singleton and subscribe to its onChange.
 * useEditorAPI() — get the central IEditorAPI facade.
 *
 * Side-effect: importing this module triggers all service DI registrations.
 */
import { useState, useEffect, useRef } from 'react';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';

// ── Ensure all service modules are loaded (side-effect: DI registration) ──
// These imports ensure register() is called before any getService().
import '../../core/events/event-bus.js';
import '../../core/editor/editor-service.js';
import '../../core/layout/layout-manager.js';
import '../../core/commands/command-registry.js';
import '../../core/extensions/extension-host.js';
import '../../core/interaction/mode-service.js';
import '../../services/notify/notify-service.js';
import '../../services/prompt/prompt-service.js';
import '../../services/clipboard/clipboard-service.js';
import '../../services/menu/menu-service.js';
import '../../services/focus/focus-service.js';
import '../../services/workspace/workspace-service.js';
import '../../api/editor-api.js';

import type { IEditorAPI } from '../../api/ieditor-api.js';

// ── useService ───────────────────────────────────

interface ChangeTracked {
  onChange(fn: () => void): () => void;
}

/**
 * Subscribe to a DI service singleton, triggering re-render on every onChange.
 */
export function useService<T extends ChangeTracked>(token: symbol): T {
  const svc = getService<T>(token);
  const [, tick] = useState(0);

  useEffect(() => {
    return svc.onChange(() => tick((t) => t + 1));
  }, [svc]);

  return svc;
}

// ── useEditorAPI ─────────────────────────────────

/**
 * Get the central EditorAPI facade, subscribed to workspace/editor changes.
 * This is the primary hook for UI components.
 */
export function useEditorAPI(): IEditorAPI {
  return getService<IEditorAPI>(TOKENS.EditorAPI);
}

/**
 * Subscribe to a service without re-rendering. Returns a ref to the latest value.
 */
export function useServiceRef<T extends ChangeTracked>(token: symbol): { readonly current: T } {
  const svc = getService<T>(token);
  const ref = useRef<T>(svc);
  ref.current = svc;

  useEffect(() => {
    return svc.onChange(() => { ref.current = svc; });
  }, [svc]);

  return ref;
}
