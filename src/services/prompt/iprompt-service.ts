/**
 * IPromptService — modal prompt for text input.
 * Promise-based: open() resolves with the user's input on confirm, or null on cancel.
 */

export interface PromptOptions {
  defaultValue?: string;
  password?: boolean;
}

export interface IPromptService {
  /** Open a prompt. Resolves with trimmed input on confirm, null on cancel. */
  open(title: string, opts?: PromptOptions): Promise<string | null>;

  /** Close the current prompt (same as cancel). */
  close(): void;

  /** Whether a prompt is currently displayed. */
  readonly isOpen: boolean;

  /** Snapshot of current prompt state (null if closed). */
  readonly state: PromptState | null;

  /** Subscribe to state changes. Returns unsubscribe function. */
  onChange(fn: () => void): () => void;
}

export interface PromptState {
  title: string;
  defaultValue: string;
  password: boolean;
}
