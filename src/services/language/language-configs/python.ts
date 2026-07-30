import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'python',
  extensions: ['.py', '.pyw', '.pyi'],
  indentSize: 4,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: [':'],
  completions: [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield', 'self', 'cls',
    'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set',
    'tuple', 'bool', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr',
    'open', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed',
    '__init__', '__str__', '__repr__', '__name__', '__main__',
  ],
  tokens: [
    { name: 'comment',  pattern: /#.*/g,                                        color: '#6c7086', priority: 10 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,                     color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,                     color: '#a6e3a1', priority: 5 },
    { name: 'number',   pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g,              color: '#fab387', priority: 4 },
    { name: 'keyword',  pattern: /\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'function',  pattern: /\b([a-zA-Z_]\w*)\s*\(/g,                     color: '#89b4fa', priority: 2 },
    { name: 'decorator', pattern: /@\w+/g,                                      color: '#f9e2af', priority: 3 },
  ],
};

export default config;
