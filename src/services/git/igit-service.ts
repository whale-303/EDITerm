/**
 * IGitService — git diff data for gutter markers and file tree colours.
 *
 * Computes per-line diff status for the active editor file and per-file
 * workspace status for the sidebar tree. Results are cached until refresh().
 */

/** Per-line diff status in the current (new) file. */
export type DiffLineType = 'added' | 'modified';

/** Complete diff information for a single file. */
export interface DiffInfo {
  /** Line-index (0-based) → diff type. Only added/modified lines are tracked. */
  lines: Map<number, DiffLineType>;
  /** Line indices that have deletions immediately above them (red _ gutter). */
  deletionAbove: Set<number>;
}

/** File-level git status for the workspace tree. */
export interface GitFileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  /** Original path (only set for renamed files). */
  oldPath?: string;
  /** True when this is a directory entry propagated from a child —
   *  NOT a direct porcelain hit. lookupGitStatus skips these. */
  propagated?: boolean;
}

export interface IGitService {
  /** Per-line diff for a file relative to HEAD. Returns null if not in a repo. */
  getFileDiff(filePath: string, currentContent: string): DiffInfo | null;

  /** Map of workspace-relative path → git status. Returns empty map if not in a repo. */
  getWorkspaceStatus(): Map<string, GitFileStatus>;

  /** Clear all cached diff/status data. Call on save or branch change. */
  refresh(): void;

  /** Subscribe to cache updates (for React re-renders). */
  onChange(fn: () => void): () => void;
}
