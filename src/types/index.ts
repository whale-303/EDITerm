// ─── Editor ───────────────────────────────────────────
export interface TextPosition {
  row: number;
  col: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export interface TextEdit {
  range: TextRange;
  text: string;
}

// ─── Layout ───────────────────────────────────────────
export type PanelOrientation = 'horizontal' | 'vertical';

export interface PanelDescriptor {
  id: string;
  type: string; // e.g. 'editor', 'file-tree', 'terminal'
  title?: string;
  state?: Record<string, unknown>;
}

export interface SplitNode {
  orientation: PanelOrientation;
  ratio: number; // 0–1
  children: [LayoutNode, LayoutNode];
}

export interface LeafNode {
  tabGroup: string; // ref → TabGroup
}

export type LayoutNode = SplitNode | LeafNode;

// ─── Commands ─────────────────────────────────────────
export interface Command {
  id: string;
  label: string;
  /** vim-style key sequence, e.g. "<C-p>" "<S-f>" */
  keybinding?: string;
  run: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandContext {
  args?: unknown[];
}

// ─── Extensions ───────────────────────────────────────
export interface ExtensionManifest {
  name: string;
  version: string;
  main: string; // entry file relative to extension root
  contributes?: {
    commands?: Command[];
    panels?: PanelDescriptor[];
  };
}

// ─── File System ──────────────────────────────────────
export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: FileEntry[];
}
