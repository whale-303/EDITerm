import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'css',
  extensions: ['.css'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: ['{'],
  completions: [
    'color', 'background', 'background-color', 'margin', 'padding',
    'border', 'border-radius', 'width', 'height', 'min-width', 'max-width',
    'min-height', 'max-height', 'display', 'position', 'top', 'right',
    'bottom', 'left', 'flex', 'flex-direction', 'justify-content',
    'align-items', 'align-self', 'grid', 'gap', 'font', 'font-size',
    'font-weight', 'font-family', 'text-align', 'text-decoration',
    'line-height', 'letter-spacing', 'opacity', 'z-index', 'overflow',
    'cursor', 'pointer-events', 'visibility', 'transform', 'transition',
    'animation', 'box-shadow', 'box-sizing', 'white-space',
    'none', 'block', 'inline', 'inline-block', 'flex', 'grid',
    'absolute', 'relative', 'fixed', 'sticky',
    'center', 'left', 'right', 'justify', 'space-between',
    'bold', 'normal', 'italic', 'underline', 'uppercase',
    'px', 'em', 'rem', '%', 'vh', 'vw', 'auto',
    'rgb', 'rgba', 'hsl', 'hsla', 'var',
  ],
  tokens: [
    { name: 'comment', pattern: /\/\*[\s\S]*?\*\//g,                color: '#6c7086', priority: 10 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 5 },
    { name: 'number',  pattern: /\b\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg)?\b/g, color: '#fab387', priority: 4 },
    { name: 'color-hex', pattern: /#[0-9a-fA-F]{3,8}\b/g,           color: '#a6e3a1', priority: 5 },
    { name: 'property', pattern: /^(\s*)([a-zA-Z-]+)\s*:/gm,         color: '#89b4fa', priority: 6 },
    { name: 'selector-class', pattern: /\.[a-zA-Z][\w-]*/g,          color: '#f9e2af', priority: 3 },
    { name: 'selector-id', pattern: /#[a-zA-Z][\w-]*/g,              color: '#fab387', priority: 3 },
    { name: 'pseudo',  pattern: /::?[a-zA-Z-]+/g,                    color: '#cba6f7', priority: 3 },
    { name: 'important', pattern: /!important\b/g,                    color: '#f38ba8', priority: 7 },
  ],
};

export default config;
