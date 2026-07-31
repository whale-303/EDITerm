/**
 * Contribution point interfaces — the abstract contracts that all features
 * implement. Inspired by VSCode's `contributes` mechanism.
 *
 * Each interface defines a single concern. Features self-register by calling
 * the static `register()` method on the corresponding registry.
 *
 * No behaviour lives here — only type contracts.
 */

import type React from 'react';
import type { Key } from '../../ui/hooks/input-stack.js';

// ── When / Context ──────────────────────────────────────

/** Dynamic context built by aggregating all IContextKeyProvider instances. */
export interface WhenContext {
  /** Resolve a context key to its current string value. */
  resolve(key: string): string;
}

// ── Input Handler ───────────────────────────────────────

/**
 * A keyboard input handler contributed by a feature.
 *
 * Replaces the LIFO inputStack pattern: instead of pushing handlers in order,
 * each handler declares an explicit `priority` and an optional `when`
 * condition. The dispatch loop evaluates `when` against the current context,
 * then iterates by priority descending.
 */
export interface IInputHandler {
  /** Unique identifier (e.g. 'sidebar-navigation'). */
  readonly id: string;
  /**
   * Priority — higher values are checked first.
   * Typical ranges:  0–10  base handlers (sidebar, editor)
   *                 20–40  popup handlers (menu, notify, completion)
   *                 50+    modal handlers (prompt)
   */
  readonly priority: number;
  /** Context condition — handler only participates when this evaluates true. */
  readonly when?: string;
  /**
   * Handle keyboard input.
   * @returns true if input was consumed (stop dispatch), false to pass down.
   */
  handle(input: string, key: Key, ctx: WhenContext): boolean;
}

// ── Popup ───────────────────────────────────────────────

/**
 * A popup (overlay) contributed by a feature.
 *
 * The PopupRegistry automatically manages the popup lifecycle:
 *   - When a popup becomes active (isActive → true), its input handler is
 *     activated and focus moves to it.
 *   - When it closes, focus is restored (by priority chain).
 */
export interface IPopupProvider {
  /** Unique id, also used as focus target name. */
  readonly id: string;
  /** Returns true when the popup is currently visible. */
  readonly isActive: boolean;
  /**
   * Priority for focus-restore chain. When popup A closes and popup B is
   * also active, the one with higher priority gets focus.
   * Typical: prompt=50, menu=30, notify=20, completion=20.
   */
  readonly priority: number;
  /** The input handler for this popup (only active when isActive). Optional until Phase 4 migration. */
  readonly inputHandler?: IInputHandler;
}

// ── Context Key ─────────────────────────────────────────

/**
 * A provider of context-key values for `when` condition evaluation.
 *
 * Instead of a hardcoded resolve() switch, each service contributes
 * the keys it owns. The ContextKeyRegistry aggregates all providers.
 */
export interface IContextKeyProvider {
  /**
   * Return the current value for `key`, or `undefined` if this provider
   * does not handle the key.
   */
  resolve(key: string): string | undefined;
}

// ── Focus Target ────────────────────────────────────────

/**
 * A focus target contributed by a panel or popup.
 *
 * Replaces the hardcoded FocusTarget union type. New panels contribute
 * focus targets without modifying FocusService.
 */
export interface IFocusTargetProvider {
  /** Target id (e.g. 'sidebar', 'editor', 'menu'). */
  readonly id: string;
  /** Whether this target is currently available to receive focus. */
  isAvailable(): boolean;
  /** Order in F3 cycle — lower numbers are earlier. */
  readonly order: number;
}

// ── Lifecycle ───────────────────────────────────────────

/**
 * A lifecycle hook contributed by a feature.
 *
 * Replaces the scattered useEffect blocks in app.tsx for bootstrap,
 * workspace changes, and shutdown.
 */
export interface ILifecycleHook {
  /** Execution order — smaller numbers run first. */
  readonly order: number;
  /** Called once after all services and contributions are registered. */
  onBootstrap?(): void | Promise<void>;
  /** Called when the workspace changes (local folder or SSH connect). */
  onWorkspaceChange?(path: string, isRemote: boolean): void;
  /** Called before the application exits. */
  onBeforeQuit?(): void;
}

// ── Panel ────────────────────────────────────────────────

/** Layout slot where a panel renders. */
export type PanelSlot = 'left' | 'main' | 'overlay' | 'bottom';

/** Props passed to panel render functions. */
export interface PanelRenderProps {
  /** Width in terminal columns allocated to this panel. */
  width: number;
  /** Height in terminal rows allocated to this panel. */
  height: number;
}

/**
 * A UI panel contributed by a feature.
 *
 * AppShell queries registered panels by slot and renders them.
 * No more hardcoded SidebarPanel / EditorPanel / OverlayLayer / StatusBarPanel
 * in the shell — panels are data.
 */
export interface IPanelContribution {
  readonly id: string;
  /** Which layout slot this panel fills. */
  readonly slot: PanelSlot;
  /** Order within the slot — lower numbers render first. */
  readonly priority: number;
  /** Context condition — panel is hidden when this evaluates false. */
  readonly when?: string;
  /** React component for this panel. */
  readonly component: React.FC<PanelRenderProps>;
}
