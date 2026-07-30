import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'ini',
  extensions: ['.ini', '.cfg', '.conf'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: ['true', 'false', 'yes', 'no', 'on', 'off'],
  tokens: [
    { name: 'comment-semi', pattern: /;.*/g,                    color: '#6c7086', priority: 10 },
    { name: 'comment-hash', pattern: /#.*/g,                    color: '#6c7086', priority: 10 },
    { name: 'section', pattern: /^\[[^\]]+\]/gm,                color: '#89b4fa', priority: 8 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,     color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,     color: '#a6e3a1', priority: 5 },
    { name: 'bool',    pattern: /\b(?:true|false|yes|no|on|off)\b/gi, color: '#fab387', priority: 3 },
    { name: 'number',  pattern: /\b-?\d+\.?\d*\b/g,             color: '#fab387', priority: 4 },
    { name: 'key-val', pattern: /^(\s*)([^=]+?)\s*=/gm,          color: '#cba6f7', priority: 7 },
  ],
};

export default config;
