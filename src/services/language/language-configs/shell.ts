import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'shell',
  extensions: ['.sh', '.bash', '.zsh', '.fish', '.ksh'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: ['then', 'do', 'else', 'elif', '{', '(('],
  completions: [
    // Keywords / control flow
    'if', 'then', 'else', 'elif', 'fi',
    'for', 'while', 'until', 'do', 'done',
    'case', 'esac', 'in', ';;',
    'function', 'return', 'exit', 'export', 'local', 'readonly',
    'source', 'shift', 'trap', 'unset', 'alias', 'set',
    'eval', 'exec', 'test', 'declare', 'typeset', 'builtin',
    'break', 'continue',
    // Test flags
    '-eq', '-ne', '-lt', '-le', '-gt', '-ge',
    '-z', '-n', '-f', '-d', '-x', '-r', '-w', '-e', '-s',
    // Builtins / common commands
    'echo', 'printf', 'cd', 'pwd', 'ls', 'cat', 'grep', 'sed', 'awk',
    'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'find', 'xargs',
    'sort', 'uniq', 'wc', 'head', 'tail', 'cut', 'tr', 'tee',
    'basename', 'dirname', 'read', 'sleep', 'wait', 'jobs', 'kill',
    'true', 'false', 'null',
  ],
  tokens: [
    // Comment — highest priority
    { name: 'comment', pattern: /#.*/g,                              color: '#6c7086', priority: 10 },
    // Shebang
    { name: 'shebang', pattern: /^#!.*/g,                            color: '#f9e2af', priority: 11 },
    // Strings
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,          color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,          color: '#a6e3a1', priority: 5 },
    // Numbers
    { name: 'number',  pattern: /\b\d+\.?\d*\b/g,                    color: '#fab387', priority: 4 },
    // Variables
    { name: 'variable-brace', pattern: /\$\{[A-Za-z_]\w*\}/g,        color: '#f9e2af', priority: 6 },
    { name: 'variable-bare',  pattern: /\$[A-Za-z_]\w*|\$[@*#?$!0-9]/g, color: '#f9e2af', priority: 5 },
    // Keywords
    { name: 'keyword', pattern: /\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|exit|export|local|readonly|source|shift|trap|unset|alias|set|eval|exec|declare|typeset|builtin|break|continue)\b/g, color: '#cba6f7', priority: 3 },
    // Test builtin flags
    { name: 'test-flag', pattern: /\b-[a-zA-Z]\b/g,                  color: '#89b4fa', priority: 2 },
    // Command substitutions / subshell
    { name: 'subshell', pattern: /\$\([^)]*\)/g,                     color: '#f9e2af', priority: 4 },
    // Function definitions
    { name: 'function', pattern: /\b([a-zA-Z_]\w*)\s*\(\)/g,         color: '#89b4fa', priority: 2 },
  ],
};

export default config;
