/**
 * Extension host — loads and sandboxes extensions.
 *
 * Phase 1: simple dynamic import (same process).
 * Phase 2: Worker Thread sandbox for isolation.
 */

import { register, getService } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import type { ExtensionManifest } from '../../types/index.js';
import type { ICommandRegistry } from '../commands/command-registry.js';

export interface ExtensionAPI {
  commands: ICommandRegistry;
}

export interface IExtensionHost {
  load(path: string): Promise<void>;
  unload(name: string): void;
  readonly loaded: ReadonlyMap<string, ExtensionManifest>;
}

export class ExtensionHost implements IExtensionHost {
  loaded = new Map<string, ExtensionManifest>();

  private buildAPI(): ExtensionAPI {
    return {
      commands: getService<ICommandRegistry>(TOKENS.CommandRegistry),
    };
  }

  async load(extPath: string): Promise<void> {
    const manifest: ExtensionManifest = await import(`${extPath}/package.json`);
    this.loaded.set(manifest.name, manifest);

    const api = this.buildAPI();
    await import(`${extPath}/${manifest.main}`);

    for (const cmd of manifest.contributes?.commands ?? []) {
      api.commands.register(cmd);
    }
  }

  unload(name: string): void {
    this.loaded.delete(name);
  }
}

register(TOKENS.ExtensionHost, () => new ExtensionHost());
