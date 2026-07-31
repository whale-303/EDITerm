import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'java',
  extensions: ['.java'],
  indentSize: 4,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '<', close: '>' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: ['{'],
  completions: [
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
    'char', 'class', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'false', 'final', 'finally', 'float', 'for', 'if',
    'implements', 'import', 'instanceof', 'int', 'interface', 'long',
    'native', 'new', 'null', 'package', 'private', 'protected', 'public',
    'return', 'short', 'static', 'strictfp', 'super', 'switch',
    'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try',
    'void', 'volatile', 'while', 'var', 'record', 'sealed', 'permits',
    'String', 'System', 'Exception', 'Override', 'Deprecated',
    'ArrayList', 'HashMap', 'List', 'Map', 'Set', 'Optional', 'Stream',
    'out', 'err', 'println', 'printf', 'equals', 'hashCode', 'toString',
  ],
  tokens: [
    { name: 'line-comment', pattern: /\/\/.*/g,                    color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g,          color: '#6c7086', priority: 10 },
    { name: 'annotation', pattern: /@\w+(?:\([^)]*\))?/g,           color: '#f9e2af', priority: 6 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,         color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,         color: '#a6e3a1', priority: 5 },
    { name: 'number',  pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDlL]?\b/g, color: '#fab387', priority: 4 },
    { name: 'keyword', pattern: /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|var|record|sealed|permits)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'type',    pattern: /\b(?:String|boolean|byte|short|int|long|float|double|char|void|Object)\b/g, color: '#89b4fa', priority: 3 },
    { name: 'boolean', pattern: /\b(?:true|false|null)\b/g,          color: '#fab387', priority: 3 },
    { name: 'class-name', pattern: /\b[A-Z][a-zA-Z0-9_$]+\b/g,     color: '#74c7ec', priority: 1 },
  ],
};

export default config;
