/**
 * Service tokens — one symbol per service.
 * These are the "keys" of the DI container.
 */

export const TOKENS = {
  // ── core ──────────────────────────────────────
  EditorService: Symbol('EditorService'),
  LayoutManager: Symbol('LayoutManager'),
  CommandRegistry: Symbol('CommandRegistry'),
  KeybindingManager: Symbol('KeybindingManager'),
  ExtensionHost: Symbol('ExtensionHost'),

  // ── services ──────────────────────────────────
  FileService: Symbol('FileService'),
  ThemeService: Symbol('ThemeService'),
  TTSService: Symbol('TTSService'),
} as const;
