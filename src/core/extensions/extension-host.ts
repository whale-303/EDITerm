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
import type { IEventBus } from '../events/event-bus.js';
import type { IEditorAPI } from '../../api/ieditor-api.js';
import { elog } from '../../util/error-log.js';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ExtensionAPI {
  commands: ICommandRegistry;
  events: IEventBus;
  editor: IEditorAPI;
}

export interface IExtensionHost {
  load(path: string): Promise<void>;
  loadAll(extensionsDir: string): Promise<void>;
  unload(name: string): void;
  readonly loaded: ReadonlyMap<string, ExtensionManifest>;
}

export class ExtensionHost implements IExtensionHost {
  loaded = new Map<string, ExtensionManifest>();

  private buildAPI(): ExtensionAPI {
    return {
      commands: getService<ICommandRegistry>(TOKENS.CommandRegistry),
      events: getService<IEventBus>(TOKENS.EventBus),
      editor: getService<IEditorAPI>(TOKENS.EditorAPI),
    };
  }

  async load(extPath: string): Promise<void> {
    const manifest: ExtensionManifest = await import(`${extPath}/package.json`);
    this.loaded.set(manifest.name, manifest);

    const api = this.buildAPI();

    // Import extension module
    const mod = await import(`${extPath}/${manifest.main}`);

    // Call activate(api) if the module exports one (VSCode convention)
    if (typeof mod.activate === 'function') {
      try {
        await mod.activate(api);
      } catch (e: any) {
        elog(`ExtensionHost: ${manifest.name} activate() failed: ${e.message}`);
      }
    }

    // Register contributed commands from manifest
    for (const cmd of manifest.contributes?.commands ?? []) {
      api.commands.register(cmd);
    }
  }

  async loadAll(extensionsDir: string): Promise<void> {
    if (!existsSync(extensionsDir)) return;

    const entries = readdirSync(extensionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extPath = join(extensionsDir, entry.name);
      const manifestPath = join(extPath, 'package.json');
      if (!existsSync(manifestPath)) continue;

      try {
        await this.load(extPath);
      } catch (e: any) {
        elog(`ExtensionHost.loadAll: ${entry.name} failed: ${e.message}`);
      }
    }
  }

  unload(name: string): void {
    this.loaded.delete(name);
  }
}

register(TOKENS.ExtensionHost, () => new ExtensionHost());
