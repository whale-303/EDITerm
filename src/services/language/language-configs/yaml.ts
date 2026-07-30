import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'yaml',
  extensions: ['.yaml', '.yml'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: ['true', 'false', 'null', '---', '...'],
  tokens: [
    { name: 'comment', pattern: /#.*/g,                              color: '#6c7086', priority: 10 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 5 },
    { name: 'bool-null', pattern: /\b(?:true|false|null|yes|no|on|off)\b/gi, color: '#fab387', priority: 3 },
    { name: 'number',  pattern: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, color: '#fab387', priority: 4 },
    { name: 'anchor',  pattern: /&[a-zA-Z_]\w*/g,                    color: '#f9e2af', priority: 4 },
    { name: 'alias',   pattern: /\*[a-zA-Z_]\w*/g,                   color: '#f9e2af', priority: 4 },
    { name: 'key',     pattern: /^(\s*)([a-zA-Z_][\w.-]*)\s*:/gm,   color: '#89b4fa', priority: 6 },
  ],
};

export default config;
