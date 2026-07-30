import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'html',
  extensions: ['.html', '.htm'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: [],
  completions: [
    'DOCTYPE', 'html', 'head', 'body', 'title', 'meta', 'link', 'style',
    'script', 'div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li', 'table',
    'tr', 'td', 'th', 'thead', 'tbody', 'form', 'input', 'button',
    'label', 'select', 'option', 'textarea', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'header', 'footer', 'nav', 'main', 'section', 'article',
    'aside', 'br', 'hr', 'strong', 'em', 'code', 'pre', 'blockquote',
    'class', 'id', 'href', 'src', 'alt', 'type', 'name', 'value',
    'charset', 'content', 'rel', 'stylesheet', 'defer', 'async',
  ],
  tokens: [
    { name: 'comment', pattern: /<!--[\s\S]*?-->/g,                  color: '#6c7086', priority: 10 },
    { name: 'doctype', pattern: /<!DOCTYPE[^>]*>/gi,                 color: '#6c7086', priority: 9 },
    { name: 'tag',     pattern: /<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>/g, color: '#89b4fa', priority: 6 },
    { name: 'attr',    pattern: /\b[a-zA-Z-]+(?==)/g,                color: '#f9e2af', priority: 5 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 4 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 4 },
    { name: 'entity',  pattern: /&[a-zA-Z]+;/g,                      color: '#fab387', priority: 3 },
  ],
};

export default config;
