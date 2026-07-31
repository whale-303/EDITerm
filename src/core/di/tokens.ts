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
  EventBus: Symbol('EventBus'),
  ModeService: Symbol('ModeService'),
  ContributionHost: Symbol('ContributionHost'),

  // ── services ──────────────────────────────────
  FileService: Symbol('FileService'),
  ThemeService: Symbol('ThemeService'),
  TTSService: Symbol('TTSService'),

  // ── api ───────────────────────────────────────
  EditorAPI: Symbol('EditorAPI'),

  // ── language ──────────────────────────────────
  LanguageService: Symbol('LanguageService'),
  CompletionService: Symbol('CompletionService'),

  // ── services (Phase 2) ────────────────────────
  NotifyService: Symbol('NotifyService'),
  PromptService: Symbol('PromptService'),
  FocusService: Symbol('FocusService'),
  MenuService: Symbol('MenuService'),
  ClipboardService: Symbol('ClipboardService'),
  WorkspaceService: Symbol('WorkspaceService'),

  // ── git ─────────────────────────────────────────
  GitService: Symbol('GitService'),
} as const;
