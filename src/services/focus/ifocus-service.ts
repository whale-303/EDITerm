/**
 * IFocusService — focus target management (sidebar, editor, menu, notify, prompt).
 * F3 cycles between available targets. Focus auto-routes to popups when they open.
 */

export type FocusTarget = 'sidebar' | 'editor' | 'menu' | 'notify' | 'prompt';

export interface IFocusService {
  /** Current focus target. */
  readonly current: FocusTarget;

  /** Set focus to a specific target. */
  set(target: FocusTarget): void;

  /** Cycle to the next available target. Returns the new target. */
  cycle(): FocusTarget;

  /** Subscribe to state changes. */
  onChange(fn: () => void): () => void;
}
