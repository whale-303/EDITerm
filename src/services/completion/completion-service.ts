/**
 * CompletionService — word-based code completion with prefix matching.
 * Registered as DI singleton via TOKENS.CompletionService.
 */
import { register, getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ICompletionService, CompletionItem } from './icompletion-service.js';
import type { ILanguageService } from '../language/ilanguage-service.js';
import type { IEditorService } from '../../core/editor/editor-service.js';
import type { ContributionHost } from '../../core/contributions/contribution-host.js';

const MIN_PREFIX = 2;

export class CompletionService implements ICompletionService {
  private _open = false;
  private _items: CompletionItem[] = [];
  private _allCandidates: CompletionItem[] = [];
  private _selected = 0;
  private _prefix = '';
  private _listeners = new Set<() => void>();
  /** Words indexed from current file. */
  private _wordIndex = new Set<string>();

  constructor() {
    try {
      const self = this;
      const host = getService<ContributionHost>(TOKENS.ContributionHost);
      host.contextKeys.register({
        resolve: (key: string) => {
          if (key === 'completion.isOpen') return self._open ? 'true' : 'false';
          return undefined;
        },
      });
      host.popups.register({
        id: 'completion',
        get isActive() { return self._open; },
        priority: 30,
      });
    } catch { /* ContributionHost not yet available */ }
  }

  get isOpen(): boolean { return this._open; }
  get items(): ReadonlyArray<CompletionItem> { return this._items; }
  get selectedIndex(): number { return this._selected; }
  get currentPrefix(): string { return this._prefix; }

  open(prefix: string, fileContent?: string): void {
    if (prefix.length < MIN_PREFIX) {
      this.close();
      return;
    }

    // Index file words if content provided
    if (fileContent !== undefined) {
      this._indexWords(fileContent);
    }

    // Collect candidates
    const candidates = new Set<string>();

    // 1. Language keywords
    try {
      const editorSvc = getService<IEditorService>(TOKENS.EditorService);
      const langSvc = getService<ILanguageService>(TOKENS.LanguageService);
      const path = editorSvc.activePath;
      if (path) {
        const cfg = langSvc.detect(path);
        for (const kw of cfg.completions) {
          if (kw.startsWith(prefix)) candidates.add(kw);
        }
      }
    } catch { /* services not available */ }

    // 2. Words from current file
    for (const w of this._wordIndex) {
      if (w.startsWith(prefix) && w.length >= prefix.length + 1) {
        candidates.add(w);
      }
    }

    const items: CompletionItem[] = [];
    for (const c of candidates) {
      items.push({ text: c, kind: 'word' });
    }
    items.sort((a, b) => a.text.length - b.text.length || a.text.localeCompare(b.text));

    if (items.length === 0) {
      this.close();
      return;
    }

    this._prefix = prefix;
    this._allCandidates = items;
    this._items = items;
    this._selected = 0;
    this._open = true;
    this._notify();
  }

  refilter(prefix: string): void {
    if (!this._open) return;
    this._prefix = prefix;

    if (prefix.length < MIN_PREFIX) {
      this._items = this._allCandidates.slice(0, 10);
    } else {
      this._items = this._allCandidates
        .filter(c => c.text.startsWith(prefix))
        .slice(0, 10);
    }

    if (this._items.length === 0) {
      this.close();
      return;
    }
    this._selected = Math.min(this._selected, this._items.length - 1);
    this._notify();
  }

  accept(): string | null {
    if (!this._open || this._items.length === 0) return null;
    const item = this._items[this._selected];
    this.close();
    return item?.text ?? null;
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this._items = [];
    this._selected = 0;
    this._notify();
  }

  moveSelection(delta: number): void {
    if (this._items.length === 0) return;
    this._selected = Math.max(0, Math.min(this._items.length - 1, this._selected + delta));
    this._notify();
  }

  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }

  private _indexWords(content: string): void {
    const words = content.match(/\b[a-zA-Z_]\w{1,}\b/g);
    if (!words) return;
    // Keep only reasonably unique words (not every common token)
    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    this._wordIndex.clear();
    for (const [w, count] of freq) {
      if (count >= 1 && w.length >= 3) {
        this._wordIndex.add(w);
      }
    }
  }
}

register(TOKENS.CompletionService, () => new CompletionService());
