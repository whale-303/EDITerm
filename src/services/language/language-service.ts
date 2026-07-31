/**
 * LanguageService — detects language by file extension and provides
 * language-specific configuration (syntax tokens, auto-pairs, indentation).
 *
 * Registered as DI singleton via TOKENS.LanguageService.
 */
import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILanguageService, LanguageConfig, Token } from './ilanguage-service.js';
import tsConfig from './language-configs/typescript.js';
import tsxConfig from './language-configs/tsx.js';
import pyConfig from './language-configs/python.js';
import jsonConfig from './language-configs/json.js';
import mdConfig from './language-configs/markdown.js';
import txtConfig from './language-configs/plaintext.js';
import yamlConfig from './language-configs/yaml.js';
import iniConfig from './language-configs/ini.js';
import javaConfig from './language-configs/java.js';
import htmlConfig from './language-configs/html.js';
import cssConfig from './language-configs/css.js';
import tomlConfig from './language-configs/toml.js';
import envConfig from './language-configs/env.js';
import shellConfig from './language-configs/shell.js';
import csharpConfig from './language-configs/csharp.js';
import cppConfig from './language-configs/cpp.js';
import rustConfig from './language-configs/rust.js';
import propertiesConfig from './language-configs/properties.js';
import gradleConfig from './language-configs/gradle.js';

export class LanguageService implements ILanguageService {
  private _configs: LanguageConfig[];
  private _byExt = new Map<string, LanguageConfig>();
  private _byId = new Map<string, LanguageConfig>();

  constructor() {
    this._configs = [tsConfig, tsxConfig, pyConfig, jsonConfig, mdConfig, txtConfig, yamlConfig, iniConfig, javaConfig, htmlConfig, cssConfig, tomlConfig, envConfig, shellConfig, csharpConfig, cppConfig, rustConfig, propertiesConfig, gradleConfig];
    for (const c of this._configs) {
      this._byId.set(c.id, c);
      for (const ext of c.extensions) {
        this._byExt.set(ext.toLowerCase(), c);
      }
    }
  }

  get configs(): ReadonlyArray<LanguageConfig> {
    return this._configs;
  }

  detect(filePath: string): LanguageConfig {
    const dot = filePath.lastIndexOf('.');
    if (dot >= 0) {
      const ext = filePath.slice(dot).toLowerCase();
      const found = this._byExt.get(ext);
      if (found) return found;
    }
    return txtConfig; // plaintext fallback
  }

  getById(id: string): LanguageConfig | undefined {
    return this._byId.get(id);
  }

  /** Tokenize a single line into non-overlapping Token segments. */
  tokenize(line: string, languageId: string): Token[] {
    const cfg = this._byId.get(languageId);
    if (!cfg || cfg.tokens.length === 0) return [];

    // Collect all matches with their priority
    interface RawMatch { start: number; end: number; color: string; priority: number }
    const matches: RawMatch[] = [];

    for (const rule of cfg.tokens) {
      // Clone regex to reset lastIndex
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        // When `part` is specified, colour only that capturing group
        const groupIdx = rule.part ?? 0;
        if (groupIdx > 0 && (!m[groupIdx] || m[groupIdx].length === 0)) continue;
        if (groupIdx === 0) {
          const start = m.index;
          const end = start + m[0].length;
          if (start === end) continue;
          matches.push({ start, end, color: rule.color, priority: rule.priority ?? 0 });
        } else {
          // Compute the group's position within the full match
          const groupText = m[groupIdx];
          const offsetInMatch = m[0].indexOf(groupText);
          const start = m.index + offsetInMatch;
          const end = start + groupText.length;
          if (start === end) continue;
          matches.push({ start, end, color: rule.color, priority: rule.priority ?? 0 });
        }
        if (!re.sticky && !re.global) break; // safety for non-global patterns
      }
    }

    if (matches.length === 0) return [];

    // Sort by start, then by priority desc, then by length desc
    matches.sort((a, b) =>
      a.start - b.start ||
      b.priority - a.priority ||
      (b.end - b.start) - (a.end - a.start),
    );

    // Greedy non-overlapping selection
    const result: Token[] = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start < lastEnd) continue; // overlaps with already-taken token
      result.push({ start: m.start, end: m.end, color: m.color });
      lastEnd = m.end;
    }

    return result;
  }

  indentString(languageId: string): string {
    const cfg = this._byId.get(languageId);
    if (!cfg) return '  ';
    return cfg.indentUsing === 'tabs' ? '\t' : ' '.repeat(cfg.indentSize);
  }
}

register(TOKENS.LanguageService, () => new LanguageService());
