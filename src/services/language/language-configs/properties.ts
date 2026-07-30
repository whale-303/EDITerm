import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'properties',
  extensions: ['.properties'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [],
  autoQuotes: [],
  indentTriggers: [],
  completions: ['true', 'false'],
  tokens: [
    { name: 'comment',  pattern: /^[#!].*/gm,                             color: '#6c7086', priority: 10 },
    { name: 'escape',   pattern: /\\(?:u[0-9a-fA-F]{4}|[tnrf\\'" ])/g,    color: '#fab387', priority: 6 },
    { name: 'key',      pattern: /^[^#!\s=:]+/gm,                          color: '#89b4fa', priority: 5 },
    { name: 'delimiter', pattern: /[=:]/g,                                 color: '#cba6f7', priority: 4 },
    { name: 'value',    pattern: /[=:]\s*(.+)/g,                           color: '#a6e3a1', priority: 3 },
  ],
};

export default config;
