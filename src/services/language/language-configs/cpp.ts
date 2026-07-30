import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'cpp',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.hh', '.ino'],
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
    // C/C++ keywords
    'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch',
    'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'concept',
    'const', 'consteval', 'constexpr', 'constinit', 'continue',
    'co_await', 'co_return', 'co_yield', 'decltype', 'default',
    'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export',
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if',
    'inline', 'int', 'long', 'mutable', 'namespace', 'new',
    'noexcept', 'nullptr', 'operator', 'override', 'private',
    'protected', 'public', 'register', 'return', 'short', 'signed',
    'sizeof', 'static', 'static_assert', 'struct', 'switch',
    'template', 'this', 'thread_local', 'throw', 'true', 'try',
    'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
    'virtual', 'void', 'volatile', 'wchar_t', 'while',
    // Common types
    'size_t', 'ssize_t', 'ptrdiff_t', 'int8_t', 'int16_t', 'int32_t',
    'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    // C standard library
    'printf', 'scanf', 'fprintf', 'sprintf', 'snprintf', 'fopen',
    'fclose', 'fread', 'fwrite', 'fseek', 'ftell', 'fgets', 'fputs',
    'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove',
    'memset', 'memcmp', 'strlen', 'strcpy', 'strncpy', 'strcat',
    'strcmp', 'strncmp', 'strstr', 'strchr', 'strrchr', 'atoi',
    'atof', 'atol', 'abs', 'qsort', 'bsearch', 'assert', 'perror',
    // C++ standard library
    'std', 'cout', 'cin', 'cerr', 'endl', 'vector', 'string',
    'array', 'map', 'unordered_map', 'set', 'unordered_set',
    'queue', 'deque', 'stack', 'list', 'forward_list',
    'unique_ptr', 'shared_ptr', 'weak_ptr', 'make_unique',
    'make_shared', 'move', 'forward', 'pair', 'tuple', 'optional',
    'variant', 'any', 'span', 'string_view', 'function', 'bind',
    'thread', 'mutex', 'lock_guard', 'unique_lock', 'condition_variable',
    'promise', 'future', 'async', 'atomic', 'filesystem',
    'iterator', 'algorithm', 'sort', 'find', 'copy', 'transform',
    'accumulate', 'begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend',
    // Preprocessor (for completion)
    'include', 'define', 'ifdef', 'ifndef', 'if', 'elif', 'else',
    'endif', 'pragma', 'error', 'warning', 'undef', 'line',
    // NULL variants
    'NULL', 'nullptr', 'EOF', 'EXIT_SUCCESS', 'EXIT_FAILURE',
  ],
  tokens: [
    { name: 'line-comment',  pattern: /\/\/.*/g,                           color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g,                 color: '#6c7086', priority: 10 },
    { name: 'preprocessor',  pattern: /^(\s*#\s*(?:include|define|undef|ifdef|ifndef|if|elif|else|endif|pragma|error|warning|line).*)/gm, color: '#f9e2af', priority: 9 },
    { name: 'include-path',  pattern: /[<\"][.\/\w-]+\.h(?:pp)?[>\"]/g,    color: '#a6e3a1', priority: 8 },
    { name: 'string-double', pattern: /\"(?:[^\"\\]|\\.)*\"/g,              color: '#a6e3a1', priority: 5 },
    { name: 'char',          pattern: /'(?:[^'\\]|\\.)'/g,                  color: '#a6e3a1', priority: 5 },
    { name: 'number-hex',    pattern: /\b0[xX][0-9a-fA-F]+\b/g,             color: '#fab387', priority: 4 },
    { name: 'number',        pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFlLuU]?\b/g, color: '#fab387', priority: 4 },
    { name: 'keyword',       pattern: /\b(?:alignas|alignof|auto|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|concept|const|consteval|constexpr|constinit|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|override|private|protected|public|register|return|short|signed|sizeof|static|static_assert|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'type',          pattern: /\b(?:int|long|float|double|char|bool|short|void|signed|unsigned|size_t|ssize_t|ptrdiff_t|int\d+_t|uint\d+_t|auto)\b/g, color: '#89b4fa', priority: 3 },
    { name: 'bool-null',     pattern: /\b(?:true|false|nullptr|NULL)\b/g,   color: '#fab387', priority: 3 },
    { name: 'function',      pattern: /\b([a-zA-Z_]\w*)\s*\(/g,             color: '#89b4fa', priority: 2 },
  ],
};

export default config;
