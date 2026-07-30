/**
 * IEditorAPI — the central API surface of EDITerm.
 *
 * This is the ONLY interface that UI components and extensions use to
 * interact with the editor. All underlying services are accessible through
 * this facade, plus convenience methods that coordinate multiple services.
 */
import type { IFileService } from '../services/file/ifile-service.js';
import type { ICommandRegistry } from '../core/commands/command-registry.js';
import type { IEventBus } from '../core/events/event-bus.js';
import type { IModeService } from '../core/interaction/mode-service.js';
import type { IEditorService } from '../core/editor/editor-service.js';
import type { IWorkspaceService } from '../services/workspace/iworkspace-service.js';
import type { INotifyService } from '../services/notify/inotify-service.js';
import type { IPromptService } from '../services/prompt/iprompt-service.js';
import type { IMenuService } from '../services/menu/imenu-service.js';
import type { IFocusService } from '../services/focus/ifocus-service.js';
import type { IClipboardService } from '../services/clipboard/iclipboard-service.js';
import type { ILayoutManager } from '../core/layout/layout-manager.js';

export interface IEditorAPI {
  // ── Sub-services (direct access) ──────────────

  readonly fs: IFileService;
  readonly commands: ICommandRegistry;
  readonly events: IEventBus;
  readonly mode: IModeService;
  readonly editor: IEditorService;
  readonly workspace: IWorkspaceService;
  readonly notify: INotifyService;
  readonly prompt: IPromptService;
  readonly menu: IMenuService;
  readonly focus: IFocusService;
  readonly clipboard: IClipboardService;
  readonly layout: ILayoutManager;

  // ── Convenience: file operations ──────────────

  /** Open a file in the editor. Switches to AUTO mode and focuses editor. */
  openFile(path: string): Promise<void>;

  /** Save the currently active file (or a specific path). */
  saveFile(path?: string): Promise<void>;

  /** Close a file in the editor. */
  closeFile(path: string): void;

  /** Delete a file or directory with confirmation. */
  deleteFile(path: string): Promise<boolean>;

  // ── Convenience: workspace ────────────────────

  /** Parse and connect to an SSH server. Chains password prompt. */
  connectSSH(connStr: string): Promise<void>;

  /** Open a local folder as workspace. */
  openFolder(dirPath: string): Promise<void>;

  // ── Convenience: lifecycle ────────────────────

  /** Bootstrap: load initial file tree, etc. */
  bootstrap(): Promise<void>;

  /** Cleanup before exit. */
  dispose(): void;
}
