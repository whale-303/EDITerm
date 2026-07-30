/**
 * Modal editor state machine — 3 top-level modes.
 *
 *          ┌──────────┐
 *          │  NORMAL  │  startup / hub
 *          └────┬─────┘
 *           v /   \ a (or Enter)
 *      ┌────────┐  ┌────────┐
 *      │  VIM   │  │  AUTO  │
 *      └──┬─────┘  └──┬─────┘
 *        Esc          Esc
 *
 * AUTO  — conventional editor: arrow keys, type-to-insert, mouse.
 * VIM   — classic vim with sub-modes: insert / visual / command.
 * NORMAL — hub: press 'v' for VIM, 'a' for AUTO.
 */

export type EditorMode = 'normal' | 'vim' | 'auto';

/** Only meaningful when top-level mode is 'vim'. */
export type VimSubMode =
  | 'vim-normal'
  | 'insert'
  | 'visual'
  | 'visual-line'
  | 'visual-block'
  | 'command';

export interface ModeChangeEvent {
  from: EditorMode;
  to: EditorMode;
  vimFrom?: VimSubMode;
  vimTo?: VimSubMode;
}

export type ModeChangeListener = (ev: ModeChangeEvent) => void;

export class ModeManager {
  private _mode: EditorMode = 'normal';
  private _vimSub: VimSubMode = 'vim-normal';
  private listeners = new Set<ModeChangeListener>();

  // ── Accessors ───────────────────────────────────

  get mode(): EditorMode { return this._mode; }
  get vimSubMode(): VimSubMode { return this._vimSub; }

  // ── Top-level transitions ───────────────────────

  /** Attempt a top-level mode transition. Returns true if one occurred. */
  tryTransition(key: string): boolean {
    const prev = this._mode;

    // ── In NORMAL ──────────────────────────────
    if (this._mode === 'normal') {
      if (key === 'v') {
        this._mode = 'vim';
        this._vimSub = 'vim-normal';
        this.notify({ from: prev, to: 'vim', vimTo: 'vim-normal' });
        return true;
      }
      if (key === 'a' || key === '<Enter>') {
        this._mode = 'auto';
        this.notify({ from: prev, to: 'auto' });
        return true;
      }
      return false;
    }

    // ── In AUTO ─────────────────────────────────
    if (this._mode === 'auto') {
      if (key === '<Esc>') {
        this._mode = 'normal';
        this.notify({ from: prev, to: 'normal' });
        return true;
      }
      return false;
    }

    // ── In VIM ──────────────────────────────────
    if (this._mode === 'vim') {
      return this._tryVimTransition(key, prev);
    }

    return false;
  }

  // ── VIM sub-mode transitions ──────────────────

  private _tryVimTransition(key: string, topFrom: EditorMode): boolean {
    const prev = this._vimSub;

    if (this._vimSub === 'vim-normal') {
      // Enter insert
      if (key === 'i' || key === 'I' || key === 'a' || key === 'A' || key === 'o' || key === 'O') {
        this._vimSub = 'insert';
        this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'insert' });
        return true;
      }
      // Enter visual variants
      if (key === 'v') { this._vimSub = 'visual'; this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'visual' }); return true; }
      if (key === 'V') { this._vimSub = 'visual-line'; this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'visual-line' }); return true; }
      if (key === '<C-v>') { this._vimSub = 'visual-block'; this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'visual-block' }); return true; }
      // Enter command
      if (key === ':') { this._vimSub = 'command'; this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'command' }); return true; }
      // Back to NORMAL
      if (key === '<Esc>') {
        this._mode = 'normal';
        this._vimSub = 'vim-normal';
        this.notify({ from: topFrom, to: 'normal', vimFrom: prev });
        return true;
      }
      return false;
    }

    // Esc from any VIM sub-mode → vim-normal
    if (key === '<Esc>') {
      this._vimSub = 'vim-normal';
      this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'vim-normal' });
      return true;
    }

    // Enter from command
    if (this._vimSub === 'command' && key === '<Enter>') {
      this._vimSub = 'vim-normal';
      this.notify({ from: topFrom, to: 'vim', vimFrom: prev, vimTo: 'vim-normal' });
      return true;
    }

    return false;
  }

  // ── Force mode ─────────────────────────────────

  setMode(mode: EditorMode): void {
    const prev = this._mode;
    this._mode = mode;
    if (mode === 'vim') this._vimSub = 'vim-normal';
    this.notify({ from: prev, to: mode });
  }

  // ── Listeners ──────────────────────────────────

  onModeChange(fn: ModeChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(ev: ModeChangeEvent): void {
    for (const fn of this.listeners) fn(ev);
  }
}
