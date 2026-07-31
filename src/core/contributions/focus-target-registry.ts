/**
 * FocusTargetRegistry — manages focus targets contributed by panels and popups.
 *
 * Replaces the hardcoded FocusTarget union type and the try/catch chain in
 * FocusService._computeAvailable(). Each target declares its own availability
 * predicate and cycle order.
 */

import type { IFocusTargetProvider } from './types.js';

export class FocusTargetRegistry {
  private _targets = new Map<string, IFocusTargetProvider>();

  /** Register a focus target. Replaces any existing target with the same id. */
  register(target: IFocusTargetProvider): () => void {
    this._targets.set(target.id, target);
    return () => this._targets.delete(target.id);
  }

  /** Remove a target by id. */
  unregister(id: string): void {
    this._targets.delete(id);
  }

  /** True if a target with the given id is registered and currently available. */
  isAvailable(id: string): boolean {
    const t = this._targets.get(id);
    return t ? t.isAvailable() : false;
  }

  /**
   * All currently available targets, sorted by order ascending
   * (lower order = earlier in F3 cycle).
   */
  getAvailable(): ReadonlyArray<IFocusTargetProvider> {
    return [...this._targets.values()]
      .filter((t) => t.isAvailable())
      .sort((a, b) => a.order - b.order);
  }

  /** All registered targets (including unavailable), sorted by order. */
  getAll(): ReadonlyArray<IFocusTargetProvider> {
    return [...this._targets.values()].sort((a, b) => a.order - b.order);
  }

  /** Get a single target by id, or undefined. */
  get(id: string): IFocusTargetProvider | undefined {
    return this._targets.get(id);
  }
}
