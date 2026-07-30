import { register } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import type { Command, CommandContext } from '../../types/index.js';

export interface ICommandRegistry {
  register(command: Command): void;
  unregister(id: string): void;
  execute(id: string, ctx?: CommandContext): Promise<void>;
  getAll(): Command[];
  getById(id: string): Command | undefined;
  /** Find the first command whose keybinding matches the input string. */
  findByKeybinding(input: string): Command | undefined;
}

export class CommandRegistry implements ICommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      console.warn(`Command "${command.id}" overwritten`);
    }
    this.commands.set(command.id, command);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  async execute(id: string, ctx?: CommandContext): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) throw new Error(`Unknown command: ${id}`);
    await cmd.run(ctx ?? {});
  }

  getAll(): Command[] {
    return [...this.commands.values()];
  }

  getById(id: string): Command | undefined {
    return this.commands.get(id);
  }

  findByKeybinding(input: string): Command | undefined {
    for (const cmd of this.commands.values()) {
      if (cmd.keybinding === input) return cmd;
    }
    return undefined;
  }
}

register(TOKENS.CommandRegistry, () => new CommandRegistry());
