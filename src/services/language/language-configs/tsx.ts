/**
 * TSX / JSX language config.
 *
 * Builds on the TypeScript token set with JSX-specific rules that detect
 * component tags, HTML elements, attributes, expressions, and JSX comments.
 * The JSX rules run at higher priority so they win over generic keyword/type
 * tokens inside JSX markup.
 */
import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'tsx',
  extensions: ['.tsx', '.jsx'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '<', close: '>' },
    { open: "`", close: "`" },
  ],
  autoQuotes: ['"', "'", '`'],
  indentTriggers: ['{'],
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
    'boolean', 'symbol', 'bigint', 'object', 'constructor',
    // Builtins
    'console', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map',
    'Set', 'Promise', 'Error', 'Date', 'RegExp', 'Math', 'JSON',
    'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval',
    'document', 'window', 'process', 'Buffer', '__dirname', '__filename',
    // JSX / React
    'className', 'htmlFor', 'tabIndex', 'dangerouslySetInnerHTML',
    'defaultValue', 'defaultChecked', 'key', 'ref', 'children',
    'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback',
    'useMemo', 'useRef', 'useImperativeHandle', 'useLayoutEffect',
    'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
    'useSyncExternalStore', 'useInsertionEffect',
    'React', 'Component', 'Fragment', 'Suspense', 'StrictMode',
    'createElement', 'createContext', 'cloneElement', 'forwardRef',
    'memo', 'createRef', 'createPortal', 'flushSync',
    'lazy', 'PropTypes', 'displayName',
    'useRouter', 'Link', 'Head', 'Image', 'Script',
    'getStaticProps', 'getServerSideProps', 'getStaticPaths',
    'export default', 'props', 'state', 'render',
  ],
  tokens: [
    // ── Priority 10: Comments ─────────────────────
    { name: 'line-comment',  pattern: /\/\/.*/g,               color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g,     color: '#6c7086', priority: 10 },
    { name: 'jsx-comment',   pattern: /\{\/\*[\s\S]*?\*\/\}/g, color: '#6c7086', priority: 10 },

    // ── Priority 9: JSX tags ──────────────────────
    // Component tags (capitalized) — e.g. <App, </Modal, <MyComponent
    { name: 'jsx-component', pattern: /<\/?[A-Z][a-zA-Z0-9_$]*/g, color: '#74c7ec', priority: 9 },
    // HTML / intrinsic elements (lowercase) — e.g. <div, </span, <button
    { name: 'jsx-html-tag',  pattern: /<\/?[a-z][\w-]*/g,         color: '#89b4fa', priority: 9 },

    // ── Priority 8: Self-closing bracket ──────────
    { name: 'jsx-self-close', pattern: /\/>/g, color: '#89b4fa', priority: 8 },

    // ── Priority 7: JSX attributes ────────────────
    // Attribute name immediately before = (with possible whitespace ignored by lookahead)
    { name: 'jsx-attr', pattern: /\b[a-zA-Z_$][\w$-]*(?=\s*=)/g, color: '#f9e2af', priority: 7 },

    // ── Priority 6: JSX expressions ───────────────
    { name: 'jsx-expr', pattern: /\{[^}]*\}/g, color: '#cba6f7', priority: 6 },

    // ── Priority 5: Strings ───────────────────────
    { name: 'template',      pattern: /`[^`]*`/g,                color: '#a6e3a1', priority: 5 },
    { name: 'string-double', pattern: /"(?:[^"\\]|\\.)*"/g,      color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,      color: '#a6e3a1', priority: 5 },

    // ── Priority 4: Numbers ───────────────────────
    { name: 'number',  pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, color: '#fab387', priority: 4 },

    // ── Priority 3: Keywords / types / literals ───
    { name: 'keyword', pattern: /\b(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|super|switch|this|throw|true|try|type|typeof|var|void|while|yield|async|await|from|as|implements|abstract|static|readonly|declare|namespace|module)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'type',    pattern: /\b(?:string|number|boolean|void|any|never|unknown|symbol|bigint|object|undefined)\b/g, color: '#89b4fa', priority: 3 },
    { name: 'boolean', pattern: /\b(?:true|false|null|undefined)\b/g, color: '#fab387', priority: 3 },

    // ── Priority 2: Function calls ────────────────
    { name: 'function', pattern: /\b([a-zA-Z_$]\w*)\s*\(/g, color: '#89b4fa', priority: 2, part: 1 },
    // PascalCase class / interface / type names
    { name: 'class-name', pattern: /\b[A-Z][a-zA-Z0-9_$]+\b/g, color: '#74c7ec', priority: 1 },
  ],
};

export default config;
