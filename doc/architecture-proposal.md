# EDITerm 架构重构方案：命令驱动 + 微内核

> **A + C 结合**：以 DI 容器为内核，CommandRegistry 为神经中枢，所有功能模块化为可替换的服务/扩展。

---

## 一、分层架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Extension Layer                       │
│  第三方扩展  │  内置扩展: sidebar, editor, statusbar ...  │
├─────────────────────────────────────────────────────────┤
│                    Command Layer                         │
│  commands/   file.ts  edit.ts  view.ts  workspace.ts .. │
│  keybindings/  (key → command 映射表)                    │
├─────────────────────────────────────────────────────────┤
│                     API Layer                            │
│  IEditorAPI  — 唯一出口，封装所有服务，扩展通过它交互      │
├─────────────────────────────────────────────────────────┤
│                    Service Layer                         │
│  EditorService  FileService  NotifyService  PromptService│
│  FocusService   MenuService   WorkspaceService  ...      │
├─────────────────────────────────────────────────────────┤
│                    Core (Microkernel)                    │
│  Container(DI)  │  EventBus  │  CommandRegistry  │  ExtHost │
└─────────────────────────────────────────────────────────┘
```

**职责边界：**

| 层 | 职责 | 不负责 |
|----|------|--------|
| Core | DI、事件总线、命令注册/执行、扩展加载 | UI 渲染、业务逻辑 |
| Service | 纯状态管理 + 业务逻辑，无 React 依赖 | 键盘绑定、渲染 |
| API | 聚合所有 Service，提供统一外观 | 具体实现 |
| Command | 用户意图 → 调用 API，可绑定快捷键 | 状态管理、渲染 |
| Extension | 注册命令 + keybinding + 面板，通过 API 交互 | 直接操作 DOM/Ink |

---

## 二、Core 层（微内核）

### 2.1 Container（已有，不需改动）

```typescript
// src/core/di/container.ts
register(TOKENS.XxxService, (get) => new XxxService(get(TOKENS.EventBus)));
```

### 2.2 EventBus（新增）

```typescript
// src/core/events/event-bus.ts
export interface IEventBus {
  emit<T>(event: string, payload: T): void;
  on<T>(event: string, handler: (payload: T) => void): () => void;  // returns unsubscribe
  once<T>(event: string, handler: (payload: T) => void): void;
}

// 事件类型常量
export const Events = {
  FILE_OPENED:    'file:opened',      // { path: string }
  FILE_SAVED:     'file:saved',       // { path: string }
  FILE_DELETED:   'file:deleted',     // { path: string }
  MODE_CHANGED:   'mode:changed',     // { from, to, vimFrom, vimTo }
  FOCUS_CHANGED:  'focus:changed',    // { from, to }
  WORKSPACE_CHANGED: 'workspace:changed', // { path, isRemote }
  DIRTY_CHANGED:  'dirty:changed',    // { path, isDirty }
  NOTIFY_ADDED:   'notify:added',     // { id, message }
  NOTIFY_DISMISSED:'notify:dismissed',// { id }
  PROMPT_OPEN:    'prompt:open',      // { id, title }
  PROMPT_CLOSED:  'prompt:closed',    // { id }
  BEFORE_QUIT:    'before:quit',      // void
} as const;
```

### 2.3 CommandRegistry（已有，需增强）

```typescript
// src/core/commands/command-registry.ts
export interface ICommandRegistry {
  register(command: Command): void;
  unregister(id: string): void;
  execute(id: string, ctx?: CommandContext): Promise<void>;
  getAll(): Command[];
  getById(id: string): Command | undefined;
  findByKeybinding(key: string): Command | undefined;  // 新增
}

// Command 增强
export interface Command {
  id: string;
  label: string;
  keybinding?: string;          // "<C-s>" | "F3" | "E" | "enter" 等
  when?: string;                // 条件表达式: "mode==normal" "focus==sidebar"
  run: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandContext {
  args?: unknown[];
  source?: 'keyboard' | 'menu' | 'mouse' | 'api';
  target?: { path?: string; type?: string };
}
```

### 2.4 ExtensionHost（已有，需增强）

```typescript
// src/core/extensions/extension-host.ts
export interface ExtensionAPI {
  commands: ICommandRegistry;
  events: IEventBus;
  editor: IEditorAPI;           // 完整的 Editor API
  // 扩展可以：
  //   api.commands.register({ id: 'my.cmd', run: ... })
  //   api.events.on('file:opened', (e) => { ... })
  //   api.editor.notify('hello')
  //   api.editor.fs.readFile('/foo.ts')
}
```

---

## 三、Service 层（纯逻辑，不依赖 React）

每个 Service 是 DI 中的一个单例，**不 import React，不持有 JSX**。

### 3.1 现有 Service（保留/增强）

| Token | 类 | 职责 |
|-------|-----|------|
| `FileService` | `IFileService` (已有) | 文件读写，workspace/local/ssh 可替换 |
| `EditorService` | `EditorService` (已有) | TextBuffer 管理，cursor，打开/关闭文件 |
| `LayoutManager` | `LayoutManager` (已有) | 面板布局、分割、Tab |

### 3.2 待新增 Service

```typescript
// ── NotifyService ──────────────────────────
// 职责：通知队列管理、自动消失、超时
export interface INotifyService {
  add(message: string, actions?: NotifyAction[], timeout?: number): number;
  dismiss(id: number): void;
  readonly items: NotifyItem[];          // observable
  readonly hasActionable: boolean;
}

// ── PromptService ─────────────────────────
// 职责：prompt 显示/关闭、输入值管理、confirm/cancel
export interface IPromptService {
  open(title: string, opts?: PromptOptions): Promise<string | null>;  // resolves on confirm, null on cancel
  close(): void;
  readonly isOpen: boolean;
  readonly current: PromptState | null;
}
// 注：open() 返回 Promise，替代回调地狱

// ── FocusService ──────────────────────────
// 职责：焦点目标管理、F3 轮询、popup auto-focus、close-restore
export interface IFocusService {
  readonly current: FocusTarget;
  cycle(): void;
  set(target: FocusTarget): void;
  readonly availableTargets: FocusTarget[];
}

// ── MenuService ───────────────────────────
// 职责：上下文菜单状态、高亮、键盘导航
export interface IMenuService {
  show(x: number, y: number, items: MenuItem[]): void;
  close(): void;
  readonly state: MenuState | null;
  highlightIndex: number;
  moveHighlight(delta: number): void;
}

// ── WorkspaceService ──────────────────────
// 职责：workspace 切换、SSH 连接管理、vfs 引用
export interface IWorkspaceService {
  readonly vfs: IFileService;
  readonly isRemote: boolean;
  switchLocal(path: string): Promise<void>;
  connectSSH(config: SSHConfig): Promise<void>;
  disconnect(): Promise<void>;
  refreshTree(): Promise<FileEntry[]>;
  readonly tree: FileEntry[];
  readonly expandedPaths: Set<string>;
  toggleExpand(path: string): void;
  readonly sidebarPath: string;
  setSidebarPath(path: string): void;
}

// ── ClipboardService ──────────────────────
// 职责：内部剪贴板（文件复制/剪切）
export interface IClipboardService {
  copy(path: string): void;
  cut(path: string): void;
  paste(destDir: string): Promise<void>;
  readonly hasContent: boolean;
  clear(): void;
}

// ── ModeService (ModeManager 的 DI 包装) ──
// 职责：模式转换、状态查询
// 已有 ModeManager，只需注册到 DI
```

### 3.3 职责边界示例

`app.tsx` 中的 `connectSSH`（~60 行）→ `WorkspaceService.connectSSH()` + `PromptService.open()`

```
之前 app.tsx:
  connectSSH 回调中做：解析连接串 → setPrompt(密码) → 创建 SSHFileService →
  清理 editor state → listDir → 错误回滚

之后：
  WorkspaceService.connectSSH(connStr)  // 解析、创建、清理
  PromptService.open('Password', {password:true})  // 统一 prompt
  都通过 api 调用
```

---

## 四、API 层（EditorAPI）

**唯一对外接口，所有扩展和 UI 组件通过它交互：**

```typescript
// src/api/editor-api.ts
export interface IEditorAPI {
  // ── 子服务（直接暴露） ──
  readonly fs: IFileService;           // 文件系统
  readonly commands: ICommandRegistry; // 命令注册
  readonly events: IEventBus;          // 事件订阅
  readonly mode: IModeService;         // 模式

  // ── 文件操作 ──
  openFile(path: string): Promise<void>;
  saveFile(path?: string): Promise<void>;
  closeFile(path: string): void;

  // ── 编辑器状态 ──
  readonly editor: IEditorService;     // buffers, cursor, activePath
  readonly content: string[];          // 当前文件的实时内容
  readonly cursor: TextPosition;

  // ── 工作区 ──
  readonly workspace: IWorkspaceService;

  // ── 通知 / Prompt / 菜单 ──
  readonly notify: INotifyService;
  readonly prompt: IPromptService;
  readonly menu: IMenuService;

  // ── 焦点 ──
  readonly focus: IFocusService;

  // ── 剪贴板 ──
  readonly clipboard: IClipboardService;

  // ── 生命周期 ──
  quit(): void;
  readonly isQuitting: boolean;
}
```

### UI 组件使用示例

```typescript
// app.tsx 瘦身后（~150 行）
const App: React.FC = () => {
  const api = useEditorAPI(); // 从 DI 获取 API
  useKeyboardDispatch();      // 输入 → 命令 dispatch
  useResizeHandler();         // 窗口尺寸

  return (
    <AppShell>
      <SidebarPanel api={api} />
      <EditorPanel api={api} />
      <StatusBarPanel api={api} />
      <OverlayLayer api={api} />    {/* notify + prompt + menu + palette */}
    </AppShell>
  );
};
```

**每个 Panel 是独立的 React 组件，通过 `api` prop 获取所需服务。不再有 props drilling 地狱。**

---

## 五、Command 层

### 5.1 命令模块化

```
src/commands/
  file-commands.ts      — file.open, file.save, file.close, file.delete, file.rename, ...
  edit-commands.ts      — edit.cut, edit.copy, edit.paste, edit.undo, edit.redo, ...
  view-commands.ts      — view.toggleSidebar, view.cycleFocus, view.commandPalette, ...
  workspace-commands.ts — workspace.openFolder, workspace.connectSSH, workspace.disconnect, ...
  mode-commands.ts      — mode.auto, mode.vim, mode.normal, mode.escape
  sidebar-commands.ts   — sidebar.select, sidebar.expand, sidebar.collapse, sidebar.menu
  help-commands.ts      — help.about, help.shortcuts
```

### 5.2 命令示例

```typescript
// src/commands/file-commands.ts
export function registerFileCommands(api: IEditorAPI): void {
  api.commands.register({
    id: 'file.save',
    label: 'Save File',
    keybinding: 's',
    when: 'focus==sidebar || focus==editor',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.editor.activePath;
      if (!path) return;
      await api.saveFile(path);
      api.notify.add(`Saved: ${path}`, [], 5000);
    },
  });

  api.commands.register({
    id: 'file.delete',
    label: 'Delete File',
    keybinding: 'x',
    when: 'focus==sidebar',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.workspace.sidebarPath;
      const confirmed = await api.prompt.open(`Delete ${path}?`, {
        actions: [
          { key: 'y', label: 'Confirm' },
          { key: 'n', label: 'Cancel' },
        ],
        timeout: 30000,
      });
      if (!confirmed) return;
      await api.fs.delete(path);
      api.workspace.refreshTree();
    },
  });

  api.commands.register({
    id: 'workspace.connectSSH',
    label: 'Connect SSH',
    keybinding: 'h',
    when: 'focus==sidebar && sidebarPath==/',
    run: async () => {
      const connStr = await api.prompt.open('SSH (ssh user@host [-p port] [/path])', {});
      if (!connStr) return;
      const password = await api.prompt.open('Password', { password: true });
      if (password === null) return;
      try {
        await api.workspace.connectSSH({ connStr, password });
        api.notify.add(`Connected: ${api.workspace.vfs.basePath}`, [], 5000);
      } catch (e) {
        api.notify.add(`SSH failed: ${(e as Error).message}`, [], 5000);
      }
    },
  });
}
```

### 5.3 Keybinding 解析

```typescript
// src/core/commands/keybinding.ts
// 输入 → 命令匹配
export function matchCommand(
  input: string,
  key: Key,
  commands: Command[],
  context: { mode: string; focus: string; sidebarPath?: string },
): Command | undefined {
  return commands.find(cmd => {
    if (!cmd.when) return cmd.keybinding === input;
    return cmd.keybinding === input && evalWhen(cmd.when, context);
  });
}
```

---

## 六、重构路线（分 5 阶段，每阶段可独立提交）

### Phase 1：Core 增强（1 天）

| 任务 | 文件 |
|------|------|
| 新增 `EventBus` | `src/core/events/event-bus.ts` |
| 增强 `CommandRegistry`（`when` 条件、`findByKeybinding`） | `src/core/commands/command-registry.ts` |
| 增强 `ExtensionHost`（注入 `IEditorAPI`） | `src/core/extensions/extension-host.ts` |
| 新增 DI tokens | `src/core/di/tokens.ts` |
| 注册 `ModeManager` 到 DI | `ModeService` |

### Phase 2：Service 抽离（2 天）

从 `app.tsx` 逐一抽离，每个独立文件、独立注册：

| 序号 | 从 app.tsx 抽离 | → Service |
|------|-----------------|-----------|
| 1 | `notifications` state + `addNotify`/`dismissNotify` + auto-dismiss timers | `NotifyService` |
| 2 | `prompt` state + `promptValue` + confirm/cancel 回调链 | `PromptService` |
| 3 | `focusTarget` + `getAvailableTargets` + `cycleFocus` + auto-focus/restore effects | `FocusService` |
| 4 | `menu` + `menuHighlight` + `showMenu`/`closeMenu` + keyboard nav | `MenuService` |
| 5 | `clipboard` ref + copy/cut/paste 逻辑 | `ClipboardService` |
| 6 | `vfs` + `connectSSH` + `fileTree` + `treeExpanded` | `WorkspaceService` |
| 7 | `dirtyFiles` + `dirtyContentCache` + `fileLoadedContent` 跟踪 | 合并入 `EditorService` |

**每个 Service 的接口在 `src/services/xxx/ixxx-service.ts`，实现在 `xxx-service.ts`，DI 注册。**

### Phase 3：API 层 + Command 注册（1 天）

| 任务 | 文件 |
|------|------|
| 实现 `IEditorAPI` | `src/api/editor-api.ts` |
| 将所有已有操作转为 Command 并注册 | `src/commands/*.ts` |
| 实现 `useKeyboardDispatch` hook | `src/ui/hooks/use-keyboard-dispatch.ts` |
| 替换 `app.tsx` 中的硬编码 handler | 改为命令 dispatch |

### Phase 4：UI 组件拆分（1 天）

```
src/ui/app.tsx  (~150 行，纯编排)
src/ui/panels/
  app-shell.tsx        — 顶层布局
  sidebar-panel.tsx    — 侧边栏 + 上下文菜单触发
  editor-panel.tsx     — 编辑器区域
  status-bar-panel.tsx — 状态栏
  overlay-layer.tsx   — notify + prompt + menu + palette 浮层
```

**每个 Panel 只通过 `api` prop 获取所需服务，不用 ref/state 穿透。**

### Phase 5：扩展验证（0.5 天）

| 任务 |
|------|
| 写一个示例扩展（如 `hello-world`），验证 ExtensionAPI 完整性 |
| 确认 `api.commands.register` + `api.events.on` 链路畅通 |
| 确认 keybinding 不冲突的覆盖规则 |

---

## 七、app.tsx 前后对比

### Before（当前 ~1543 行）

```
App 组件直接管理:
  rows cols mode vimSub mouse content cursor scrollOffset selection
  showPalette fileTree sidebarPath activeFilePath treeFocus treeExpanded
  dirtyFiles dirtyContentCache clipboard prompt promptValue notifications
  menu focusTarget ...
  + connectSSH + showContextMenu + handleSidebarKey + handleAutoMode
  + handleVimNormal + handleInsert + moveCursorVisual + handleSave + doSave
  + parseSGRMouse + flattenTree + flattenTreeWithRoot + updateTreeChildren
  + 15 个 useEffect/useLayoutEffect
```

### After（~150 行）

```
App 组件:
  const api = useEditorAPI();
  useKeyboardDispatch(api);
  useResizeHandler();

  return (
    <AppShell api={api}>
      <SidebarPanel api={api} />
      <EditorPanel api={api} />
      <StatusBarPanel api={api} />
      <OverlayLayer api={api} />
    </AppShell>
  );
```

所有业务逻辑分布在 Service 层，通过 API 暴露。组件只负责渲染和调用 API。

---

## 八、扩展示例

```typescript
// extensions/git-blame/index.js
export function activate(api: ExtensionAPI) {
  // 注册命令
  api.commands.register({
    id: 'git.blame',
    label: 'Git Blame',
    keybinding: '<C-b>',
    when: 'focus==editor',
    run: async (ctx) => {
      const path = ctx.target?.path ?? api.editor.activePath;
      const content = await api.editor.fs.readFile(path);
      // git blame logic...
      api.editor.notify.add(`Blame loaded for ${path}`, [], 5000);
    },
  });

  // 监听事件
  api.events.on('file:saved', async ({ path }) => {
    // auto-format on save
    const content = await api.editor.fs.readFile(path);
    // format and write back...
  });
}
```

---

## 九、关键决策

| 决策 | 结论 | 理由 |
|------|------|------|
| Service 是否依赖 React？ | **不依赖** | 纯 TS，可单元测试，可被扩展直接 import |
| 状态如何在 React 中反映？ | **每个 Service 提供 `onChange` / EventBus** | UI 订阅变更 → setState |
| 命令 vs 直接调用 API？ | **键盘/菜单走命令；代码调用走 API** | 命令可重绑定、可禁用、可扩展覆盖 |
| DI 容器是否保留？ | **保留并扩展** | 已有基础设施，避免引入 inversify 等重型库 |
| ExtensionHost 是否立即实现 Worker 隔离？ | **Phase 2（远期）** | 当前同进程够用 |
