import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'toml',
  extensions: ['.toml'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: ['true', 'false'],
  tokens: [
    { name: 'comment', pattern: /#.*/g,                              color: '#6c7086', priority: 10 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-multi', pattern: /"""(?:[^"\\]|\\.)*"""/g,       color: '#a6e3a1', priority: 5 },
    { name: 'number',  pattern: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, color: '#fab387', priority: 4 },
    { name: 'bool',    pattern: /\b(?:true|false)\b/g,               color: '#fab387', priority: 3 },
    { name: 'date',    pattern: /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?\b/g, color: '#fab387', priority: 5 },
    { name: 'section', pattern: /^\[[^\]]+\]/gm,                      color: '#89b4fa', priority: 8 },
    { name: 'key',     pattern: /^(\s*)([a-zA-Z_][\w.-]*)\s*=/gm,    color: '#cba6f7', priority: 6 },
  ],
};

export default config;
