/**
 * IFileService — public filesystem interface consumed by the editor.
 *
 * The VFS class implements this interface.  It is kept intentionally
 * close to IVFSProvider so that the VFS can delegate most methods
 * without transformation.
 *
 * The ONLY differences from IVFSProvider are:
 *   — basePath: display path for the VFS root (always '/' for VFS)
 *   — changeWorkspace: REMOVED (workspace switching is now done by
 *     mount/unmount on the VFS, coordinated by WorkspaceService)
 */
import type { FileEntry } from '../../types/index.js';

export interface IFileService {
  /** Root path for display / prompts. */
  readonly basePath: string;

  /** Resolve path segments into an absolute virtual path. */
  resolve(...segments: string[]): string;

  /** List directory contents (single level — children NOT populated, lazy-loaded on expand). */
  listDir(dirPath: string): Promise<FileEntry[]>;

  /** Read file content as UTF-8. */
  readFile(filePath: string): Promise<string>;

  /** Write file content. */
  writeFile(filePath: string, content: string): Promise<void>;

  /** Check whether a path exists. */
  exists(filePath: string): Promise<boolean>;

  /** Delete a file or directory (recursive). */
  delete(filePath: string): Promise<void>;

  /** Rename / move a file or directory. Returns the new virtual path. */
  rename(oldPath: string, newName: string): Promise<string>;

  /** Create an empty file in a directory. Returns the virtual path. */
  createFile(parentDir: string, name: string): Promise<string>;

  /** Create a directory. Returns the virtual path. */
  createDirectory(parentDir: string, name: string): Promise<string>;

  /** Get the parent directory path. */
  parentDir(filePath: string): string;

  /** Get the final component of a path. */
  baseName(filePath: string): string;

  /** Check if a path is a directory. */
  isDirectory(filePath: string): Promise<boolean>;

  /** Copy a file or directory to a destination directory. Returns the new path. */
  copyEntry(srcPath: string, destDir: string): Promise<string>;
}
