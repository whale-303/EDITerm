/**
 * TypeScript / JavaScript language config.
 */
import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '<', close: '>' },
  ],
  autoQuotes: ['"', "'", '`'],
  completions: [
    // Keywords
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
    'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
    'false', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'interface', 'let', 'new', 'null', 'of', 'package',
    'private', 'protected', 'public', 'return', 'super', 'switch',
    'this', 'throw', 'true', 'try', 'type', 'typeof', 'var', 'void',
    'while', 'yield', 'async', 'await', 'from', 'as', 'implements',
    'abstract', 'static', 'readonly', 'declare', 'namespace', 'module',
    'require', 'undefined', 'any', 'never', 'unknown', 'string', 'number',
    'boolean', 'symbol', 'bigint', 'object',
    // Builtins
    'console', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map',
    'Set', 'Promise', 'Error', 'Date', 'RegExp', 'Math', 'JSON',
    'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval',
    'document', 'window', 'process', 'Buffer', '__dirname', '__filename',
  ],
  tokens: [
    // Comments first (highest priority)
    { name: 'line-comment', pattern: /\/\/.*/g,           color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g, color: '#6c7086', priority: 10 },
    // Strings
    { name: 'template',   pattern: /`[^`]*`/g,                color: '#a6e3a1', priority: 5 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,   color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,   color: '#a6e3a1', priority: 5 },
    // Numbers
    { name: 'number',     pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, color: '#fab387', priority: 4 },
    // Keywords
    { name: 'keyword',    pattern: /\b(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|super|switch|this|throw|true|try|type|typeof|var|void|while|yield|async|await|from|as|implements|abstract|static|readonly|declare|namespace|module)\b/g, color: '#cba6f7', priority: 3 },
    // Types
    { name: 'type',       pattern: /\b(?:string|number|boolean|void|any|never|unknown|symbol|bigint|object|undefined)\b/g, color: '#89b4fa', priority: 3 },
    // Booleans / literals
    { name: 'boolean',    pattern: /\b(?:true|false|null|undefined)\b/g, color: '#fab387', priority: 3 },
    // Function calls
    { name: 'function',    pattern: /\b([a-zA-Z_$]\w*)\s*\(/g,         color: '#89b4fa', priority: 2 },
  ],
};

export default config;
