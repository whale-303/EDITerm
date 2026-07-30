/**
 * IClipboardService — internal file clipboard (copy/cut/paste).
 */

export interface ClipboardEntry {
  path: string;
  cut: boolean; // true = move (cut), false = copy
}

export interface IClipboardService {
  /** Copy a file path to clipboard. */
  copy(path: string): void;

  /** Cut a file path (mark for move). */
  cut(path: string): void;

  /** Current clipboard content, or null if empty. */
  readonly entry: ClipboardEntry | null;

  /** True if clipboard has content. */
  readonly hasContent: boolean;

  /** Clear clipboard. */
  clear(): void;
}
