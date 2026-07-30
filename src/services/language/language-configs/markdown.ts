import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'markdown',
  extensions: ['.md', '.mdx', '.markdown', '.mdown'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '`', close: '`' },
    { open: '*', close: '*' },
    { open: '_', close: '_' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: [],
  tokens: [
    { name: 'heading',  pattern: /^#{1,6}\s.*$/gm,              color: '#89b4fa', priority: 10 },
    { name: 'bold',     pattern: /\*\*[^*]+\*\*/g,               color: '#f9e2af', priority: 6 },
    { name: 'italic',   pattern: /(?<!\*)\*[^*]+\*(?!\*)/g,     color: '#f9e2af', priority: 5 },
    { name: 'code',     pattern: /`[^`]+`/g,                    color: '#a6e3a1', priority: 7 },
    { name: 'link',     pattern: /\[([^\]]+)\]\(([^)]+)\)/g,    color: '#89b4fa', priority: 4 },
    { name: 'list',     pattern: /^(\s*)[-*+]\s/gm,             color: '#cba6f7', priority: 8 },
    { name: 'blockquote', pattern: /^>\s?/gm,                   color: '#6c7086', priority: 8 },
  ],
};

export default config;
