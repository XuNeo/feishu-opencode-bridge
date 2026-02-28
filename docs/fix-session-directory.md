# 修复 `/session new <directory>` 工作目录不生效问题

## 问题描述

使用 `/session new ~/projects/vela` 创建会话后，工具回复创建成功并显示正确的工作区路径。但后续向 AI 发送消息时，AI 实际执行仍然在默认工作目录（`aiassistant`）下，而非指定的 `vela` 目录。

## 排查过程

### 第一步：确认 session 创建逻辑

检查 `/session new` 命令的实现，确认 `session.create({ query: { directory } })` 正确传入了目录参数，session store 中 `sessionDirectory` 字段也被正确存储。**创建环节没有问题。**

### 第二步：发现 API 调用缺少 directory 参数

阅读 OpenCode SDK 类型定义（`@opencode-ai/sdk` 的 `types.gen.d.ts`），发现所有 API 端点（`prompt_async`、`command`、`shell`、`abort`、`revert`、`summarize`）都接受 `query.directory` 参数。

**关键发现**：OpenCode API 是**目录作用域（directory-scoped）**的。`session.create` 虽然带了 `directory`，但后续的 `prompt_async` 等调用如果不带 `directory` 参数，会在**默认目录**下执行——session ID 本身不足以决定执行目录。

### 第三步：首次修复尝试（导致更严重问题）

给所有 client 方法和调用方加上了 `directory` 参数。修复后发现：**所有群聊的 AI 都不回复了**（工具命令如 `/help` 正常，但 AI 对话无响应）。

### 第四步：定位 SSE 事件流问题

进一步排查发现 OpenCode 的 SSE 事件流（`/event`）同样是**目录作用域**的：

- `/event`（无 directory 参数）→ 只接收默认目录的事件
- `/event?directory=X` → 只接收目录 X 的事件

当 `prompt_async` 带了 `?directory=X` 发出请求后，响应事件只会推送到订阅了 `?directory=X` 的事件流。而此前只有一个默认（无 directory）的 SSE 连接，因此所有指定了 directory 的请求的响应事件都**静默丢失**了。

`prompt_async` 返回 204 是"已接受"的意思，不代表事件流匹配——这一点非常有误导性。

## 最终修复方案

### 核心变更：多目录事件流管理

将 `OpencodeClientWrapper` 中的**单一 SSE 事件流**替换为**多目录事件流 Map**：

```typescript
// 之前：单一事件流
private eventAbortController: AbortController | null = null;
private eventStreamActive = false;

// 之后：多目录事件流
private directoryStreams: Map<string, DirectoryEventStream> = new Map();

interface DirectoryEventStream {
  controller: AbortController;
  active: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
}
```

### 关键方法

1. **`ensureDirectoryEventStream(directory?)`** — 按需懒创建每个目录的 SSE 订阅。首次对某个目录发起 API 调用时自动创建对应的事件流。

2. **`buildUrlWithDirectory(path, directory?)`** — 辅助方法，为 raw fetch 请求构建带 `?directory=` 的 URL。

3. **所有 API 方法**（`sendMessagePartsAsync`、`sendMessageAsync`、`sendCommand`、`sendShellCommand`、`abortSession`、`revertMessage`、`summarizeSession`）均：
   - 新增可选 `directory` 参数
   - 调用前先 `ensureDirectoryEventStream(directory)` 确保事件流存在
   - 请求时携带 `?directory=` 查询参数

4. **所有调用方**（`group.ts`、`command.ts`、`card-action.ts`）从 `chatSessionStore` 获取 `sessionDirectory` 并传递给 client 方法。

5. **`disconnect()`** 遍历并中止所有目录事件流。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/opencode/client.ts` | 核心：多目录事件流系统、`ensureDirectoryEventStream()`、所有 API 方法加 `directory` 参数 |
| `src/handlers/group.ts` | `processPrompt` 传递 `sessionDirectory` 给 `sendMessagePartsAsync` |
| `src/handlers/command.ts` | 5 处调用点传递 `sessionDirectory`（summarize, abort, shell, command, revert） |
| `src/handlers/card-action.ts` | `abortSession` 传递 `session.sessionDirectory` |

## 经验总结

1. **OpenCode API 的目录作用域是全局性的** — 不仅是 session 创建，所有 API 调用和事件订阅都需要匹配目录。
2. **SSE 事件流必须与 API 调用的目录参数一致** — 否则事件静默丢失，没有任何错误提示。
3. **204 响应不代表端到端成功** — `prompt_async` 返回 204 只表示请求被接受，不保证事件流能收到对应事件。
