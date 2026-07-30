/**
 * Core text buffer — a rope-like data structure for efficient editing.
 * Stores lines as a string[]; operations are O(lines touched).
 */

import type { TextEdit, TextPosition, TextRange } from '../../types/index.js';

export class TextBuffer {
  private lines: string[];

  constructor(text = '') {
    this.lines = text === '' ? [''] : text.split('\n');
  }

  get lineCount(): number {
    return this.lines.length;
  }

  getLine(index: number): string {
    return this.lines[index] ?? '';
  }

  getText(range?: TextRange): string {
    if (!range) return this.lines.join('\n');
    // Simple implementation — single line for now, multi-line later
    if (range.start.row === range.end.row) {
      return this.lines[range.start.row].slice(range.start.col, range.end.col);
    }
    const selected: string[] = [];
    selected.push(this.lines[range.start.row].slice(range.start.col));
    for (let r = range.start.row + 1; r < range.end.row; r++) {
      selected.push(this.lines[r]);
    }
    selected.push(this.lines[range.end.row].slice(0, range.end.col));
    return selected.join('\n');
  }

  applyEdit(edit: TextEdit): void {
    const { range, text } = edit;
    const newLines = text.split('\n');

    const before = this.lines[range.start.row].slice(0, range.start.col);
    const after = this.lines[range.end.row].slice(range.end.col);

    // Build replacement
    const head = newLines[0];
    const tail = newLines[newLines.length - 1];
    const middle = newLines.slice(1, -1);

    const result: string[] = [];
    if (newLines.length === 1) {
      result.push(before + head + after);
    } else {
      result.push(before + head);
      result.push(...middle);
      result.push(tail + after);
    }

    this.lines.splice(range.start.row, range.end.row - range.start.row + 1, ...result);
  }

  insertAt(pos: TextPosition, text: string): void {
    this.applyEdit({ range: { start: pos, end: pos }, text });
  }

  deleteRange(range: TextRange): void {
    this.applyEdit({ range, text: '' });
  }

  toString(): string {
    return this.lines.join('\n');
  }

  /** Ensure position is within buffer bounds. */
  clamp(pos: TextPosition): TextPosition {
    const row = Math.max(0, Math.min(pos.row, this.lines.length - 1));
    const col = Math.max(0, Math.min(pos.col, this.lines[row].length));
    return { row, col };
  }
}
