import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'csharp',
  extensions: ['.cs', '.csx'],
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
    // Keywords
    'abstract', 'as', 'async', 'await', 'base', 'bool', 'break',
    'byte', 'case', 'catch', 'char', 'checked', 'class', 'const',
    'continue', 'decimal', 'default', 'delegate', 'do', 'double',
    'else', 'enum', 'event', 'explicit', 'extern', 'false',
    'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if',
    'implicit', 'in', 'int', 'interface', 'internal', 'is',
    'lock', 'long', 'namespace', 'new', 'null', 'object',
    'operator', 'out', 'override', 'params', 'private',
    'protected', 'public', 'readonly', 'record', 'ref', 'return',
    'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static',
    'string', 'struct', 'switch', 'this', 'throw', 'true', 'try',
    'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort',
    'using', 'var', 'virtual', 'void', 'volatile', 'while',
    'yield',
    // Common types
    'List', 'Dictionary', 'HashSet', 'IEnumerable', 'IList',
    'Task', 'Action', 'Func', 'Task<T>', 'ValueTask',
    'Nullable', 'DateTime', 'TimeSpan', 'Guid', 'Uri',
    'StringBuilder', 'Regex', 'Stream', 'FileStream',
    'MemoryStream', 'CancellationToken', 'HttpClient',
    // Common APIs
    'Console', 'Math', 'File', 'Path', 'Directory', 'Environment',
    'JsonSerializer', 'JsonConvert', 'Activator', 'Assembly',
    'Thread', 'Monitor', 'Semaphore', 'Mutex', 'Channel',
    // LINQ
    'from', 'where', 'select', 'group', 'into', 'orderby',
    'ascending', 'descending', 'let', 'join', 'on', 'equals',
    'First', 'FirstOrDefault', 'Single', 'SingleOrDefault',
    'Where', 'Select', 'OrderBy', 'GroupBy', 'ToArray', 'ToList',
  ],
  tokens: [
    { name: 'line-comment',  pattern: /\/\/.*/g,                           color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g,                 color: '#6c7086', priority: 10 },
    { name: 'verbatim-string', pattern: /@\"(?:[^\"]|\"\")*\"/g,           color: '#a6e3a1', priority: 5 },
    { name: 'interp-string', pattern: /\$\"(?:[^\"\\]|\\.)*\"/g,           color: '#a6e3a1', priority: 5 },
    { name: 'string-double', pattern: /\"(?:[^\"\\]|\\.)*\"/g,             color: '#a6e3a1', priority: 5 },
    { name: 'char',          pattern: /'(?:[^'\\]|\\.)'/g,                 color: '#a6e3a1', priority: 5 },
    { name: 'number',        pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDmM]?\b/g, color: '#fab387', priority: 4 },
    { name: 'attribute',     pattern: /\[[A-Z][a-zA-Z.]*\]/g,              color: '#f9e2af', priority: 7 },
    { name: 'keyword',       pattern: /\b(?:abstract|as|async|await|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|record|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|var|virtual|void|volatile|while|yield)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'type',          pattern: /\b(?:int|long|float|double|decimal|bool|char|string|byte|short|uint|ulong|ushort|sbyte|object|dynamic|var|void)\b/g, color: '#89b4fa', priority: 3 },
    { name: 'bool-null',     pattern: /\b(?:true|false|null)\b/g,          color: '#fab387', priority: 3 },
    { name: 'function',      pattern: /\b([A-Za-z_]\w*)\s*\(/g,            color: '#89b4fa', priority: 2 },
  ],
};

export default config;
