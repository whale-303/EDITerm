/**
 * ICompletionService — lightweight code completion.
 *
 * Indexes words from the current file and provides prefix-based
 * completion candidates. Displayed as a popup overlay.
 */

export interface CompletionItem {
  text: string;
  /** "keyword" | "word" | "snippet" */
  kind: string;
}

export interface ICompletionService {
  readonly isOpen: boolean;
  readonly items: ReadonlyArray<CompletionItem>;
  readonly selectedIndex: number;
  /** Open completion popup with candidates matching prefix. */
  open(prefix: string, fileContent?: string): void;
  /** Close the popup and accept the selected candidate. */
  accept(): string | null;
  /** Close without accepting. */
  close(): void;
  /** Move selection up/down. */
  moveSelection(delta: number): void;
  /** React subscription. */
  onChange(fn: () => void): () => void;
}
