import type { LanguageConfig } from '../ilanguage-service.js';

const config: LanguageConfig = {
  id: 'gradle',
  extensions: ['.gradle', '.gradle.kts'],
  indentSize: 2,
  indentUsing: 'spaces',
  autoPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
  ],
  autoQuotes: ['"', "'"],
  indentTriggers: ['{'],
  completions: [
    // Groovy DSL keywords
    'apply', 'plugins', 'plugin', 'buildscript', 'repositories',
    'dependencies', 'configurations', 'allprojects', 'subprojects',
    'project', 'ext', 'task', 'tasks', 'settings', 'include',
    'rootProject', 'rootDir', 'buildDir', 'projectDir', 'gradle',
    // Dependency configurations (JVM)
    'implementation', 'api', 'compileOnly', 'runtimeOnly',
    'testImplementation', 'testCompileOnly', 'testRuntimeOnly',
    'androidTestImplementation', 'debugImplementation',
    'releaseImplementation', 'annotationProcessor',
    'kapt', 'ksp', 'kaptTest', 'kspTest',
    // Repositories
    'mavenCentral', 'google', 'maven', 'mavenLocal',
    'gradlePluginPortal', 'jcenter', 'ivy', 'flatDir',
    // Common API
    'file', 'files', 'fileTree', 'copy', 'delete', 'mkdir',
    'sync', 'zip', 'tar', 'exec', 'javaexec', 'ant',
    'doFirst', 'doLast', 'dependsOn', 'finalizedBy',
    'mustRunAfter', 'shouldRunAfter', 'onlyIf',
    'enabled', 'description', 'group', 'version',
    'register', 'named', 'getByName', 'getByPath',
    'configure', 'create', 'withType',
    // Android DSL
    'android', 'applicationId', 'compileSdk', 'minSdk',
    'targetSdk', 'versionCode', 'versionName',
    'buildTypes', 'productFlavors', 'signingConfigs',
    'release', 'debug', 'proguardFiles', 'testInstrumentationRunner',
    'manifestPlaceholders', 'dataBinding', 'viewBinding',
    'compose', 'composeOptions', 'kotlinCompilerExtensionVersion',
    'namespace', 'compileSdkVersion', 'buildToolsVersion',
    'ndkVersion', 'cmake', 'externalNativeBuild',
    'splits', 'aaptOptions', 'lintOptions', 'dexOptions',
    'packagingOptions', 'compileOptions', 'kotlinOptions',
    // Source sets
    'sourceSets', 'main', 'test', 'androidTest', 'resources',
    'java', 'kotlin', 'res', 'manifest', 'assets', 'aidl', 'jni',
    'renderscript', 'proto', 'shaders', 'mlpack', 'mlmodels',
    // Kotlin DSL
    'val', 'var', 'fun', 'by', 'lazy', 'object', 'import',
    // Common properties
    'sourceCompatibility', 'targetCompatibility',
    'jvmTarget', 'freeCompilerArgs',
    'isMinifyEnabled', 'isShrinkResources',
    'isDebuggable', 'isJniDebuggable', 'isRenderscriptDebuggable',
  ],
  tokens: [
    { name: 'line-comment',  pattern: /\/\/.*/g,                           color: '#6c7086', priority: 10 },
    { name: 'block-comment', pattern: /\/\*[\s\S]*?\*\//g,                  color: '#6c7086', priority: 10 },
    { name: 'gstring',       pattern: /\$\{[^}]*\}/g,                       color: '#f9e2af', priority: 6 },
    { name: 'gstring-var',   pattern: /\$[a-zA-Z_]\w*/g,                    color: '#f9e2af', priority: 5 },
    { name: 'string-double', pattern: /\"(?:[^\"\\]|\\.)*\"/g,              color: '#a6e3a1', priority: 5 },
    { name: 'string-single', pattern: /'(?:[^'\\]|\\.)*'/g,                 color: '#a6e3a1', priority: 5 },
    { name: 'number',        pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g,    color: '#fab387', priority: 4 },
    { name: 'keyword-groovy', pattern: /\b(?:apply|plugins|plugin|buildscript|repositories|dependencies|configurations|allprojects|subprojects|project|ext|task|tasks|settings|include|doFirst|doLast|dependsOn|finalizedBy|mustRunAfter|shouldRunAfter|onlyIf|register|named|getByName|getByPath|configure|withType|import|def|return|if|else|for|in|while|switch|case|break|continue|throw|try|catch|finally|new|true|false|null)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'keyword-kotlin', pattern: /\b(?:val|var|fun|by|lazy|object|import|package|class|interface|enum|data|sealed|open|abstract|override|private|protected|public|internal|companion|const|lateinit|suspend|inline|noinline|crossinline|reified|typealias|init|this|super|return|if|else|when|for|while|do|break|continue|throw|try|catch|finally|true|false|null)\b/g, color: '#cba6f7', priority: 3 },
    { name: 'config-name',   pattern: /\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly|androidTestImplementation|debugImplementation|releaseImplementation|annotationProcessor|kapt|ksp|kaptTest|kspTest|mavenCentral|google|mavenLocal|gradlePluginPortal|jcenter|sourceSets|buildTypes|productFlavors|signingConfigs)\b/g, color: '#89b4fa', priority: 3 },
    { name: 'function',      pattern: /\b([a-zA-Z_]\w*)\s*\(/g,             color: '#89b4fa', priority: 2 },
    { name: 'closure',       pattern: /\b([a-zA-Z_]\w*)\s*\{/g,             color: '#89b4fa', priority: 2 },
  ],
};

export default config;
