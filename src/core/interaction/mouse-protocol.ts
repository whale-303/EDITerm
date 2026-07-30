/**
 * Internal mouse event type used throughout EDITerm.
 * Mouse tracking uses SGR escape sequences via stdin
 * (Claude Code approach: DECSET 1000/1002/1006).
 */

export interface MouseEvent {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 'left' | 'middle' | 'right' | 'none';
  col: number; // 0-indexed
  row: number; // 0-indexed
  modifiers: number; // bitmask: 4=shift, 8=alt/meta, 16=ctrl
}
