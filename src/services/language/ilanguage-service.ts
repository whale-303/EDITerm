/**
 * ILanguageService — file type detection + language-specific configuration.
 *
 * Each language is described by a LanguageConfig that drives syntax
 * highlighting, auto-pairing, indentation, and completion.
 */

/** A matched token for syntax highlighting — position + style. */
export interface Token {
  /** Start column (inclusive). */
  start: number;
  /** End column (exclusive). */
  end: number;
  /** CSS/Ink color name or hex, e.g. "blue", "#89b4fa". */
  color: string;
}

/** Regex-based token rule used for syntax highlighting. */
export interface TokenRule {
  /** Display name (e.g. "keyword", "string", "comment"). */
  name: string;
  /** Regex to match. Must have the `g` flag for multi-match. */
  pattern: RegExp;
  /** Ink color for matched text. */
  color: string;
  /** Priority — higher rules win when ranges overlap. */
  priority?: number;
  /**
   * Capturing-group index to use for the highlight range (1-indexed).
   * When set, only the text captured by that group is coloured;
   * the surrounding match context (e.g. `(` in a function-call pattern)
   * is left untouched.  Defaults to 0 (whole match).
   */
  part?: number;
}

/** Auto-closing bracket / quote pair. */
export interface AutoPair {
  open: string;
  close: string;
}

export interface LanguageConfig {
  /** Unique language id, e.g. "typescript". */
  id: string;
  /** File extensions (with dot), e.g. [".ts", ".tsx"]. */
  extensions: string[];
  /** Syntax highlighting token rules. */
  tokens: TokenRule[];
  /** Bracket pairs that auto-close. */
  autoPairs: AutoPair[];
  /** Quote characters that auto-close. */
  autoQuotes: string[];
  /** Spaces per indentation level. */
  indentSize: number;
  /** Use spaces or tabs for indentation. */
  indentUsing: 'spaces' | 'tabs';
  /** Characters that trigger one extra indent level on Enter (e.g. '{', ':'). */
  indentTriggers: string[];
  /** Keywords / builtins offered as completions. */
  completions: string[];
}

export interface ILanguageService {
  /** Detect language by file path. Returns the config or plaintext fallback. */
  detect(filePath: string): LanguageConfig;
  /** Get config by language id. */
  getById(id: string): LanguageConfig | undefined;
  /** All registered language configs. */
  readonly configs: ReadonlyArray<LanguageConfig>;
  /** Tokenize a single line. Returns non-overlapping tokens sorted by position. */
  tokenize(line: string, languageId: string): Token[];
  /** Resolve indent string for a language (spaces or tab). */
  indentString(languageId: string): string;
}
