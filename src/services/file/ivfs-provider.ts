/**
 * IVFSProvider — contract that every filesystem backend must satisfy.
 *
 * All path parameters are RELATIVE to the provider's mount point.
 * A provider that receives an empty-string path means "show me the root
 * of this backend" (e.g. drive listing for a local provider, or / for SSH).
 *
 * Providers MUST NOT import from node:fs or any other concrete filesystem
 * module — but concrete implementations of course do (LocalFileProvider).
 *
 * See [[LocalFileProvider]], [[SSHFileService]] for concrete implementations.
 */
import type { FileEntry } from '../../types/index.js';

export interface IVFSProvider {
  /** Human-readable label shown in mount listings. */
  readonly label: string;

  // ── Pure path operations (no FS access) ──────────

  /** Resolve segments into a normalized path within this provider. */
  resolve(...segments: string[]): string;

  /** Get the parent directory path. */
  parentDir(path: string): string;

  /** Get the final component of a path. */
  baseName(path: string): string;

  // ── Filesystem operations ────────────────────────

  /** List directory contents (single level — children NOT populated). */
  listDir(path: string): Promise<FileEntry[]>;

  /** Read file content as UTF-8. */
  readFile(path: string): Promise<string>;

  /** Write file content (creates parent directories as needed). */
  writeFile(path: string, content: string): Promise<void>;

  /** Check whether a path exists. */
  exists(path: string): Promise<boolean>;

  /** Delete a file or directory (recursive). */
  delete(path: string): Promise<void>;

  /** Rename/move a file or directory. Returns the new path. */
  rename(oldPath: string, newName: string): Promise<string>;

  /** Create an empty file. Returns the new path. */
  createFile(parentDir: string, name: string): Promise<string>;

  /** Create a directory. Returns the new path. */
  createDirectory(parentDir: string, name: string): Promise<string>;

  /** Check if a path is a directory. */
  isDirectory(path: string): Promise<boolean>;

  /** Copy a file or directory to a destination directory. Returns the new path. */
  copyEntry(srcPath: string, destDir: string): Promise<string>;

  /** Check whether a file is likely binary (null bytes, high non-printable ratio). */
  isProbablyBinary?(path: string): Promise<boolean>;

  // ── Optional: native path bridge ─────────────────

  /**
   * Convert a provider-relative path to a native OS path.
   * Returns null if not applicable (e.g. SSH provider has no native path).
   * Used by GitService to run git CLI commands against the real filesystem.
   */
  toNativePath?(path: string): string | null;

  /**
   * Convert a native OS path back to a provider-relative path.
   * Inverse of toNativePath. Returns null if the path doesn't belong to
   * this provider (e.g. a different drive when scoped to a directory).
   */
  fromNativePath?(nativePath: string): string | null;

  // ── Optional: shell command execution ─────────────

  /**
   * Execute a shell command in the context of this filesystem backend.
   *
   * For local providers this runs on the host machine.
   * For SSH providers this runs on the remote server.
   *
   * Returns stdout, stderr, and exit code (null if the process was killed).
   */
  execCommand?(command: string, options?: { cwd?: string }): Promise<ExecResult>;
}

/** Result of executing a shell command through a filesystem provider. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
