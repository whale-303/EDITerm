import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'env',
  extensions: ['.env'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: [],
  tokens: [
    { name: 'comment', pattern: /#.*/g,                              color: '#6c7086', priority: 10 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 5 },
    { name: 'number',  pattern: /\b\d+\.?\d*\b/g,                    color: '#fab387', priority: 4 },
    { name: 'export',  pattern: /\bexport\s+/g,                      color: '#cba6f7', priority: 6 },
    { name: 'key',     pattern: /^([A-Z_][A-Z0-9_]*)\s*=/gm,         color: '#89b4fa', priority: 6 },
    { name: 'variable', pattern: /\$\{[A-Z_][A-Z0-9_]*\}/g,          color: '#f9e2af', priority: 5 },
    { name: 'variable-bare', pattern: /\$[A-Z_][A-Z0-9_]*/g,         color: '#f9e2af', priority: 4 },
  ],
};

export default config;
