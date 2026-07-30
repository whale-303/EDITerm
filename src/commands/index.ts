/**
 * Command registration — all built-in commands.
 *
 * Call registerAllCommands(api) during bootstrap to register every
 * built-in command into the CommandRegistry.
 */
import type { IEditorAPI } from '../api/ieditor-api.js';
import { registerFileCommands } from './file-commands.js';
import { registerViewCommands } from './view-commands.js';
import { registerWorkspaceCommands } from './workspace-commands.js';

export function registerAllCommands(api: IEditorAPI): void {
  registerFileCommands(api);
  registerViewCommands(api);
  registerWorkspaceCommands(api);
}

// Re-export individual registrars for selective usage
export { registerFileCommands } from './file-commands.js';
export { registerViewCommands } from './view-commands.js';
export { registerWorkspaceCommands } from './workspace-commands.js';
