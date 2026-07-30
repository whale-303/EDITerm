import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'json',
  extensions: ['.json', '.jsonc'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
  ],
  autoQuotes: ['"'],
  completions: ['true', 'false', 'null'],
  tokens: [
    { name: 'string',  pattern: /"(?:[^"\\]|\\.)*"/g,         color: '#a6e3a1', priority: 5 },
    { name: 'number',  pattern: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, color: '#fab387', priority: 4 },
    { name: 'boolean', pattern: /\b(?:true|false|null)\b/g,   color: '#fab387', priority: 3 },
    { name: 'key',     pattern: /"(?:[^"\\]|\\.)*"\s*:/g,     color: '#89b4fa', priority: 6 },
  ],
};

export default config;
