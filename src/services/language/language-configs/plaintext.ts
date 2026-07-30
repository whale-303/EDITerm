import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'plaintext',
  extensions: [],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
  ],
  autoQuotes: ['"', "'", '`'],
  indentTriggers: [],
  completions: [],
  tokens: [],
};

export default config;
