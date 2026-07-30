/**
 * IMenuService — context menu state and keyboard navigation.
 */

export interface MenuItem {
  key: string;       // single-char keyboard shortcut
  label: string;     // display label
  action: () => void;
  disabled?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface IMenuService {
  /** Current menu state, null if closed. */
  readonly state: MenuState | null;

  /** True if menu is currently open. */
  readonly isOpen: boolean;

  /** Highlight index for keyboard navigation. */
  readonly highlightIndex: number;

  /** Show a menu at position. */
  show(x: number, y: number, items: MenuItem[]): void;

  /** Close the menu. */
  close(): void;

  /** Move highlight up/down. Clamped to valid range. */
  moveHighlight(delta: number): void;

  /** Set highlight to a specific index. */
  setHighlight(index: number): void;

  /** Subscribe to state changes. */
  onChange(fn: () => void): () => void;
}
