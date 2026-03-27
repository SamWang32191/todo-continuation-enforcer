# Todo Continuation Enforcer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在全新的 `todo-continuation-enforcer` repo 中建立可本地載入的獨立 plugin，複製 `oh-my-openagent` 中 `todo-continuation-enforcer` 的核心 continuation 行為，並附帶基本測試。

**Architecture:** 專案採薄 plugin shell + 厚 continuation feature。plugin entry 只做載入與事件分派，核心 decision logic、countdown、injection、session state 放在 `src/todo-continuation-enforcer/`；所有宿主 API 都先經過 adapters。第一版只保留 continuation 主線，不引入 `atlas` 或其他 continuation 相關功能。

**Tech Stack:** TypeScript, Bun, `@opencode-ai/plugin`, `@opencode-ai/sdk`, `bun:test`

---

## File Structure

### Files to Create

- `package.json` - 套件資訊、build/test/typecheck scripts、依賴
- `tsconfig.json` - TypeScript 編譯設定
- `bunfig.toml` - Bun test 設定
- `.gitignore` - 忽略 `node_modules` 與 `dist`
- `.claude-plugin/plugin.json` - plugin manifest
- `README.md` - 本地載入與開發說明
- `src/index.ts` - plugin default export
- `src/plugin/create-plugin.ts` - plugin factory
- `src/plugin/event-handler.ts` - continuation 事件分派
- `src/plugin/adapters/logger.ts` - logger 介面與預設實作
- `src/plugin/adapters/background-task-probe.ts` - background task probe 介面
- `src/plugin/adapters/message-store.ts` - message store 介面
- `src/plugin/adapters/session-api.ts` - session API 介面與 SDK adapter
- `src/shared/system-directive.ts` - 最小系統 directive helper
- `src/todo-continuation-enforcer/index.ts` - feature 建立入口
- `src/todo-continuation-enforcer/types.ts` - feature 型別
- `src/todo-continuation-enforcer/constants.ts` - 常數與 prompt
- `src/todo-continuation-enforcer/todo.ts` - todo 判定
- `src/todo-continuation-enforcer/abort-detection.ts` - abort 判定
- `src/todo-continuation-enforcer/compaction-guard.ts` - compaction 保護
- `src/todo-continuation-enforcer/session-state.ts` - per-session state store
- `src/todo-continuation-enforcer/pending-question-detection.ts` - pending question 判定
- `src/todo-continuation-enforcer/stagnation-detection.ts` - stagnation 判定
- `src/todo-continuation-enforcer/resolve-message-info.ts` - 從 adapter 解析最近訊息
- `src/todo-continuation-enforcer/countdown.ts` - countdown scheduler
- `src/todo-continuation-enforcer/continuation-injection.ts` - continuation 注入
- `src/todo-continuation-enforcer/idle-event.ts` - idle 主 decision gate
- `src/todo-continuation-enforcer/handler.ts` - 非 idle/idle 事件 router
- `tests/unit/todo.test.ts`
- `tests/unit/abort-detection.test.ts`
- `tests/unit/compaction-guard.test.ts`
- `tests/unit/idle-decision.test.ts`
- `tests/integration/todo-continuation-enforcer.integration.test.ts`
- `tests/helpers/fakes.ts` - fake adapters 與測試 fixture builders

### Files to Reference During Implementation

- `../oh-my-openagent/src/hooks/todo-continuation-enforcer/*.ts` - 原始行為來源
- `../oh-my-openagent/src/plugin/hooks/create-continuation-hooks.ts` - 原本註冊方式
- `docs/superpowers/specs/2026-03-28-todo-continuation-enforcer-design.md` - 設計依據

### Resulting Boundaries

- `src/plugin/` 只知道「收到事件後交給 feature」
- `src/plugin/adapters/` 只負責把宿主 SDK 轉成 feature 可用介面
- `src/todo-continuation-enforcer/` 不直接 import `oh-my-openagent`
- `tests/unit/` 驗證純邏輯，`tests/integration/` 驗證主流程

## Task 1: 建立專案骨架與 plugin 載入面

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `.gitignore`
- Create: `.claude-plugin/plugin.json`
- Create: `README.md`
- Create: `src/index.ts`
- Create: `src/plugin/create-plugin.ts`
- Test: `bun run typecheck`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "todo-continuation-enforcer",
  "version": "0.1.0",
  "description": "Standalone OpenCode plugin that continues unfinished todos on session idle",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    ".claude-plugin"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.24",
    "@opencode-ai/sdk": "^1.2.24"
  },
  "devDependencies": {
    "bun-types": "1.3.10",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: 建立 TypeScript/Bun 基本設定**

`tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "lib": ["ESNext"],
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`bunfig.toml`

```toml
[test]
root = "."
```

`.gitignore`

```gitignore
node_modules/
dist/
```

- [ ] **Step 3: 建立 plugin manifest 與最小 entrypoint**

`.claude-plugin/plugin.json`

```json
{
  "name": "todo-continuation-enforcer",
  "version": "0.1.0",
  "description": "Standalone todo continuation plugin for OpenCode"
}
```

`src/plugin/create-plugin.ts`

```ts
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

export function createPlugin(): Plugin {
  return async function TodoContinuationEnforcerPlugin(_ctx: PluginInput) {
    return {
      name: "todo-continuation-enforcer",
    }
  }
}
```

`src/index.ts`

```ts
import { createPlugin } from "./plugin/create-plugin"

export default createPlugin()
```

- [ ] **Step 4: 安裝依賴並驗證 typecheck/build 可跑**

Run: `bun install && bun run typecheck && bun run build`

Expected:
- `bun install` 成功安裝 `@opencode-ai/plugin`、`@opencode-ai/sdk`
- `bun run typecheck` 結束且無 TypeScript error
- `bun run build` 產生 `dist/index.js` 與 `dist/index.d.ts`

- [ ] **Step 5: 補 README 最小使用說明**

~~~md
# todo-continuation-enforcer

Standalone OpenCode plugin that continues unfinished todos when a session becomes idle.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Local plugin loading

Point OpenCode/OpenAgent plugin loading to this repository root after building.
~~~

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json bunfig.toml .gitignore .claude-plugin/plugin.json README.md src/index.ts src/plugin/create-plugin.ts
git commit -m "chore: scaffold standalone todo continuation plugin"
```

## Task 2: 先寫純邏輯測試，再建立核心狀態與判定模組

**Files:**
- Create: `src/shared/system-directive.ts`
- Create: `src/todo-continuation-enforcer/types.ts`
- Create: `src/todo-continuation-enforcer/constants.ts`
- Create: `src/todo-continuation-enforcer/todo.ts`
- Create: `src/todo-continuation-enforcer/abort-detection.ts`
- Create: `src/todo-continuation-enforcer/compaction-guard.ts`
- Create: `src/todo-continuation-enforcer/session-state.ts`
- Test: `tests/unit/todo.test.ts`
- Test: `tests/unit/abort-detection.test.ts`
- Test: `tests/unit/compaction-guard.test.ts`

- [ ] **Step 1: 寫 `todo.ts` 的 failing test**

`tests/unit/todo.test.ts`

```ts
import { describe, expect, test } from "bun:test"

import { getIncompleteCount } from "../../src/todo-continuation-enforcer/todo"

describe("getIncompleteCount", () => {
  test("counts pending and in_progress todos only", () => {
    expect(
      getIncompleteCount([
        { content: "a", status: "pending", priority: "high" },
        { content: "b", status: "in_progress", priority: "medium" },
        { content: "c", status: "completed", priority: "low" },
        { content: "d", status: "cancelled", priority: "low" },
      ])
    ).toBe(2)
  })
})
```

- [ ] **Step 2: 跑 test 確認失敗**

Run: `bun test tests/unit/todo.test.ts`

Expected: FAIL with `Cannot find module '../../src/todo-continuation-enforcer/todo'`

- [ ] **Step 3: 寫 `abort-detection.ts` 與 `compaction-guard.ts` 的 failing tests**

`tests/unit/abort-detection.test.ts`

```ts
import { describe, expect, test } from "bun:test"

import { isAbortLikeError } from "../../src/todo-continuation-enforcer/abort-detection"

describe("isAbortLikeError", () => {
  test("matches MessageAbortedError and AbortError", () => {
    expect(isAbortLikeError({ name: "MessageAbortedError" })).toBe(true)
    expect(isAbortLikeError({ name: "AbortError" })).toBe(true)
    expect(isAbortLikeError({ name: "OtherError" })).toBe(false)
  })
})
```

`tests/unit/compaction-guard.test.ts`

```ts
import { describe, expect, test } from "bun:test"

import { isCompactionGuardActive } from "../../src/todo-continuation-enforcer/compaction-guard"

describe("isCompactionGuardActive", () => {
  test("returns true inside guard window", () => {
    expect(
      isCompactionGuardActive(
        { recentCompactionAt: 10_000, stagnationCount: 0, consecutiveFailures: 0 },
        10_100,
      )
    ).toBe(true)
  })
})
```

- [ ] **Step 4: 跑測試確認都失敗**

Run: `bun test tests/unit/todo.test.ts tests/unit/abort-detection.test.ts tests/unit/compaction-guard.test.ts`

Expected: FAIL because implementation files do not exist yet

- [ ] **Step 5: 建立最小共用型別與常數**

`src/todo-continuation-enforcer/types.ts`

```ts
export interface Todo {
  content: string
  status: string
  priority: string
  id?: string
}

export interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>
  countdownInterval?: ReturnType<typeof setInterval>
  isRecovering?: boolean
  countdownStartedAt?: number
  abortDetectedAt?: number
  lastIncompleteCount?: number
  lastInjectedAt?: number
  awaitingPostInjectionProgressCheck?: boolean
  inFlight?: boolean
  stagnationCount: number
  consecutiveFailures: number
  recentCompactionAt?: number
  recentCompactionEpoch?: number
  acknowledgedCompactionEpoch?: number
}
```

`src/shared/system-directive.ts`

```ts
export function createSystemDirective(tag: string): string {
  return `[${tag}]`
}
```

`src/todo-continuation-enforcer/constants.ts`

```ts
import { createSystemDirective } from "../shared/system-directive"

export const HOOK_NAME = "todo-continuation-enforcer"
export const DEFAULT_SKIP_AGENTS = ["prometheus", "compaction", "plan"]
export const COUNTDOWN_SECONDS = 2
export const ABORT_WINDOW_MS = 3_000
export const COMPACTION_GUARD_MS = 60_000
export const CONTINUATION_COOLDOWN_MS = 5_000
export const MAX_STAGNATION_COUNT = 3
export const MAX_CONSECUTIVE_FAILURES = 5
export const FAILURE_RESET_WINDOW_MS = 5 * 60_000

export const CONTINUATION_PROMPT = `${createSystemDirective("TODO_CONTINUATION")}

Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done
- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.`
```

- [ ] **Step 6: 寫最小實作讓前述 unit tests 通過**

`src/todo-continuation-enforcer/todo.ts`

```ts
import type { Todo } from "./types"

export function getIncompleteCount(todos: Todo[]): number {
  return todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled").length
}
```

`src/todo-continuation-enforcer/abort-detection.ts`

```ts
export function isAbortLikeError(error: { name?: string } | undefined): boolean {
  return error?.name === "MessageAbortedError" || error?.name === "AbortError"
}
```

`src/todo-continuation-enforcer/compaction-guard.ts`

```ts
import { COMPACTION_GUARD_MS } from "./constants"
import type { SessionState } from "./types"

export function isCompactionGuardActive(state: SessionState | undefined, now: number): boolean {
  if (!state?.recentCompactionAt) return false
  return now - state.recentCompactionAt < COMPACTION_GUARD_MS
}
```

`src/todo-continuation-enforcer/session-state.ts`

```ts
import type { SessionState } from "./types"

export class SessionStateStore {
  private readonly state = new Map<string, SessionState>()

  getState(sessionID: string): SessionState {
    const existing = this.state.get(sessionID)
    if (existing) return existing

    const created: SessionState = {
      stagnationCount: 0,
      consecutiveFailures: 0,
    }
    this.state.set(sessionID, created)
    return created
  }

  getExistingState(sessionID: string): SessionState | undefined {
    return this.state.get(sessionID)
  }

  clear(sessionID: string): void {
    const state = this.state.get(sessionID)
    if (state?.countdownTimer) clearTimeout(state.countdownTimer)
    if (state?.countdownInterval) clearInterval(state.countdownInterval)
    this.state.delete(sessionID)
  }
}
```

- [ ] **Step 7: 跑 unit tests 確認通過**

Run: `bun test tests/unit/todo.test.ts tests/unit/abort-detection.test.ts tests/unit/compaction-guard.test.ts`

Expected: PASS with 3 passing test files

- [ ] **Step 8: Commit**

```bash
git add src/shared/system-directive.ts src/todo-continuation-enforcer/types.ts src/todo-continuation-enforcer/constants.ts src/todo-continuation-enforcer/todo.ts src/todo-continuation-enforcer/abort-detection.ts src/todo-continuation-enforcer/compaction-guard.ts src/todo-continuation-enforcer/session-state.ts tests/unit/todo.test.ts tests/unit/abort-detection.test.ts tests/unit/compaction-guard.test.ts
git commit -m "feat: add todo continuation core primitives"
```

## Task 3: 先寫 idle decision 與 integration failing tests，再完成 adapters 與 continuation 主流程

**Files:**
- Create: `src/plugin/adapters/logger.ts`
- Create: `src/plugin/adapters/background-task-probe.ts`
- Create: `src/plugin/adapters/message-store.ts`
- Create: `src/plugin/adapters/session-api.ts`
- Create: `src/todo-continuation-enforcer/pending-question-detection.ts`
- Create: `src/todo-continuation-enforcer/stagnation-detection.ts`
- Create: `src/todo-continuation-enforcer/resolve-message-info.ts`
- Create: `src/todo-continuation-enforcer/countdown.ts`
- Create: `src/todo-continuation-enforcer/continuation-injection.ts`
- Create: `src/todo-continuation-enforcer/idle-event.ts`
- Create: `tests/helpers/fakes.ts`
- Create: `tests/unit/idle-decision.test.ts`
- Create: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 寫 idle decision failing test**

`tests/unit/idle-decision.test.ts`

```ts
import { describe, expect, test } from "bun:test"

import { shouldContinueOnIdle } from "../../src/todo-continuation-enforcer/idle-event"

describe("shouldContinueOnIdle", () => {
  test("returns continue when all gates pass", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      skipAgents: ["plan"],
      now: 10_000,
      state: { stagnationCount: 0, consecutiveFailures: 0 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(true)
  })

  test("returns false when session is in cooldown", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      skipAgents: ["plan"],
      now: 10_000,
      state: { stagnationCount: 0, consecutiveFailures: 0, lastInjectedAt: 9_999 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("cooldown")
  })

  test("returns false when recent abort exists", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      skipAgents: ["plan"],
      now: 10_000,
      state: { stagnationCount: 0, consecutiveFailures: 0, abortDetectedAt: 9_999 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("recent_abort")
  })

  test("returns false when agent is skipped", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      skipAgents: ["plan"],
      now: 10_000,
      state: { stagnationCount: 0, consecutiveFailures: 0 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "plan",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("skip_agent")
  })

  test("returns false when compaction guard is active", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      skipAgents: ["plan"],
      now: 10_000,
      state: { stagnationCount: 0, consecutiveFailures: 0, recentCompactionAt: 9_990 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("compaction_guard")
  })
})
```

- [ ] **Step 2: 寫 integration failing test**

`tests/helpers/fakes.ts`

```ts
import type { SessionApi } from "../../src/plugin/adapters/session-api"
import type { BackgroundTaskProbe } from "../../src/plugin/adapters/background-task-probe"
import type { Logger } from "../../src/plugin/adapters/logger"

export function createFakeLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
  }
}

export function createFakeBackgroundTaskProbe(): BackgroundTaskProbe {
  return {
    hasRunningTask() {
      return false
    },
  }
}

export function createFakeSessionApi(): SessionApi {
  const prompts: string[] = []
  return {
    prompts,
    async getTodos() {
      return [{ content: "finish", status: "pending", priority: "high" }]
    },
    async getLatestMessageInfo() {
      return {
        agent: "sisyphus",
        model: { providerID: "openai", modelID: "gpt-5" },
        tools: { write: true, edit: true },
      }
    },
    async injectPrompt(_sessionID, prompt) {
      prompts.push(prompt)
    },
  }
}
```

`tests/integration/todo-continuation-enforcer.integration.test.ts`

```ts
import { describe, expect, test } from "bun:test"

import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
import { createFakeBackgroundTaskProbe, createFakeLogger, createFakeSessionApi } from "../helpers/fakes"

describe("todo continuation integration", () => {
  test("injects continuation prompt when idle session has incomplete todos", async () => {
    const sessionApi = createFakeSessionApi()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(1)
    expect(sessionApi.prompts[0]).toContain("Incomplete tasks remain")
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test tests/unit/idle-decision.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: FAIL with missing implementation / export errors

- [ ] **Step 4: 定義 adapters 介面**

`src/plugin/adapters/logger.ts`

```ts
export interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
}

export function createConsoleLogger(): Logger {
  return {
    debug(message, meta) {
      console.debug(message, meta)
    },
    info(message, meta) {
      console.info(message, meta)
    },
    warn(message, meta) {
      console.warn(message, meta)
    },
  }
}
```

`src/plugin/adapters/background-task-probe.ts`

```ts
export interface BackgroundTaskProbe {
  hasRunningTask(sessionID: string): boolean
}

export function createNoopBackgroundTaskProbe(): BackgroundTaskProbe {
  return {
    hasRunningTask() {
      return false
    },
  }
}
```

`src/plugin/adapters/session-api.ts`

```ts
import type { PluginInput } from "@opencode-ai/plugin"

import type { Todo } from "../../todo-continuation-enforcer/types"

export interface MessageInfo {
  agent?: string
  model?: { providerID: string; modelID: string }
  tools?: Record<string, boolean | "ask" | "deny">
  question?: string
  error?: { name?: string }
}

export interface SessionApi {
  prompts?: string[]
  getTodos(sessionID: string): Promise<Todo[]>
  getLatestMessageInfo(sessionID: string): Promise<MessageInfo | undefined>
  injectPrompt(sessionID: string, prompt: string, options?: { agent?: string; model?: { providerID: string; modelID: string } }): Promise<void>
}

export function createSdkSessionApi(ctx: PluginInput): SessionApi {
  return {
    async getTodos(sessionID) {
      const response = await ctx.client.session.todo({ path: { id: sessionID } })
      return Array.isArray(response?.data) ? response.data as Todo[] : []
    },
    async getLatestMessageInfo() {
      return undefined
    },
    async injectPrompt(sessionID, prompt, options) {
      await ctx.client.session.promptAsync({
        path: { id: sessionID },
        body: {
          agent: options?.agent,
          model: options?.model,
          parts: [{ type: "text", text: prompt }],
        },
        query: { directory: ctx.directory },
      })
    },
  }
}
```

`src/plugin/adapters/message-store.ts`

```ts
import type { MessageInfo } from "./session-api"

export interface MessageStore {
  findLatestMessageInfo(sessionID: string): Promise<MessageInfo | undefined>
}

export function createNoopMessageStore(): MessageStore {
  return {
    async findLatestMessageInfo() {
      return undefined
    },
  }
}
```

- [ ] **Step 5: 寫 pending question、stagnation、resolve-message-info 實作**

`src/todo-continuation-enforcer/pending-question-detection.ts`

```ts
import type { MessageInfo } from "../plugin/adapters/session-api"

export function hasPendingQuestion(messageInfo: MessageInfo | undefined): boolean {
  return Boolean(messageInfo?.question)
}
```

`src/todo-continuation-enforcer/stagnation-detection.ts`

```ts
import { MAX_STAGNATION_COUNT } from "./constants"
import type { SessionState } from "./types"

export function updateStagnation(state: SessionState, incompleteCount: number): boolean {
  if (state.lastIncompleteCount === incompleteCount) {
    state.stagnationCount += 1
  } else {
    state.stagnationCount = 0
    state.lastIncompleteCount = incompleteCount
  }

  return state.stagnationCount < MAX_STAGNATION_COUNT
}
```

`src/todo-continuation-enforcer/resolve-message-info.ts`

```ts
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi, MessageInfo } from "../plugin/adapters/session-api"

export async function resolveMessageInfo(
  sessionID: string,
  sessionApi: SessionApi,
  messageStore: MessageStore,
): Promise<MessageInfo | undefined> {
  const fromApi = await sessionApi.getLatestMessageInfo(sessionID)
  if (fromApi) return fromApi
  return messageStore.findLatestMessageInfo(sessionID)
}
```

- [ ] **Step 6: 寫 countdown、injection、idle-event 核心實作**

`src/todo-continuation-enforcer/countdown.ts`

```ts
export async function runCountdown(seconds: number, callback: () => Promise<void>): Promise<void> {
  if (seconds <= 0) {
    await callback()
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), seconds * 1000)
  })
  await callback()
}
```

`src/todo-continuation-enforcer/continuation-injection.ts`

```ts
import type { SessionApi } from "../plugin/adapters/session-api"

import { CONTINUATION_PROMPT } from "./constants"
import type { Todo } from "./types"

export async function injectContinuation(args: {
  sessionID: string
  sessionApi: SessionApi
  agent?: string
  model?: { providerID: string; modelID: string }
  todos: Todo[]
}): Promise<void> {
  const remaining = args.todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled")
  const todoList = remaining.map((todo) => `- [${todo.status}] ${todo.content}`).join("\n")
  const prompt = `${CONTINUATION_PROMPT}\n\nRemaining tasks:\n${todoList}`

  await args.sessionApi.injectPrompt(args.sessionID, prompt, {
    agent: args.agent,
    model: args.model,
  })
}
```

`src/todo-continuation-enforcer/idle-event.ts`

```ts
import { ABORT_WINDOW_MS, CONTINUATION_COOLDOWN_MS, DEFAULT_SKIP_AGENTS, MAX_CONSECUTIVE_FAILURES } from "./constants"
import { getIncompleteCount } from "./todo"
import { isCompactionGuardActive } from "./compaction-guard"
import type { SessionState, Todo } from "./types"

export async function shouldContinueOnIdle(args: {
  sessionID: string
  state: SessionState
  todos: Todo[]
  now: number
  hasPendingQuestion: boolean
  hasRunningBackgroundTask: boolean
  isContinuationStopped: boolean
  agent?: string
  skipAgents?: string[]
}): Promise<{ shouldInject: boolean; reason?: string; incompleteCount: number }> {
  const incompleteCount = getIncompleteCount(args.todos)
  const skipAgents = args.skipAgents ?? DEFAULT_SKIP_AGENTS

  if (incompleteCount === 0) return { shouldInject: false, reason: "no_incomplete_todos", incompleteCount }
  if (args.hasPendingQuestion) return { shouldInject: false, reason: "pending_question", incompleteCount }
  if (args.hasRunningBackgroundTask) return { shouldInject: false, reason: "background_task", incompleteCount }
  if (args.isContinuationStopped) return { shouldInject: false, reason: "stopped", incompleteCount }
  if (args.agent && skipAgents.includes(args.agent)) return { shouldInject: false, reason: "skip_agent", incompleteCount }
  if (args.state.isRecovering) return { shouldInject: false, reason: "recovering", incompleteCount }
  if (args.state.abortDetectedAt && args.now - args.state.abortDetectedAt < ABORT_WINDOW_MS) return { shouldInject: false, reason: "recent_abort", incompleteCount }
  if (args.state.lastInjectedAt && args.now - args.state.lastInjectedAt < CONTINUATION_COOLDOWN_MS) return { shouldInject: false, reason: "cooldown", incompleteCount }
  if (args.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return { shouldInject: false, reason: "too_many_failures", incompleteCount }
  if (isCompactionGuardActive(args.state, args.now)) return { shouldInject: false, reason: "compaction_guard", incompleteCount }

  return { shouldInject: true, incompleteCount }
}
```

- [ ] **Step 7: 建立 feature 入口與主 handler**

`src/todo-continuation-enforcer/handler.ts`

```ts
import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"

import { hasPendingQuestion } from "./pending-question-detection"
import { resolveMessageInfo } from "./resolve-message-info"
import { runCountdown } from "./countdown"
import { injectContinuation } from "./continuation-injection"
import { shouldContinueOnIdle } from "./idle-event"
import { SessionStateStore } from "./session-state"
import { updateStagnation } from "./stagnation-detection"

export function createTodoContinuationHandler(args: {
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  countdownSeconds: number
}) {
  const stateStore = new SessionStateStore()

  return {
    async handleEvent(event: { type: string; sessionID: string }) {
      if (event.type === "session.deleted") {
        stateStore.clear(event.sessionID)
        return
      }

      const state = stateStore.getState(event.sessionID)

      if (event.type === "session.error") {
        state.abortDetectedAt = Date.now()
        return
      }

      if (event.type !== "session.idle") return

      const todos = await args.sessionApi.getTodos(event.sessionID)
      const messageInfo = await resolveMessageInfo(event.sessionID, args.sessionApi, args.messageStore)
      const decision = await shouldContinueOnIdle({
        sessionID: event.sessionID,
        state,
        todos,
        now: Date.now(),
        hasPendingQuestion: hasPendingQuestion(messageInfo),
        hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(event.sessionID),
        isContinuationStopped: false,
        agent: messageInfo?.agent,
      })

      if (!decision.shouldInject) {
        args.logger.debug("skip continuation", decision)
        return
      }

      if (!updateStagnation(state, decision.incompleteCount)) {
        args.logger.warn("skip continuation due to stagnation", { sessionID: event.sessionID })
        return
      }

      try {
        await runCountdown(args.countdownSeconds, async () => {
          await injectContinuation({
            sessionID: event.sessionID,
            sessionApi: args.sessionApi,
            agent: messageInfo?.agent,
            model: messageInfo?.model,
            todos,
          })
          state.lastInjectedAt = Date.now()
          state.awaitingPostInjectionProgressCheck = true
          state.consecutiveFailures = 0
        })
      } catch (error) {
        state.consecutiveFailures += 1
        args.logger.warn("continuation injection failed", { sessionID: event.sessionID, error })
      }
    },
  }
}
```

`src/todo-continuation-enforcer/index.ts`

```ts
import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"

import { createTodoContinuationHandler } from "./handler"

export function createTodoContinuationEnforcer(args: {
  sessionApi: SessionApi
  messageStore?: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  countdownSeconds?: number
}) {
  return createTodoContinuationHandler({
    sessionApi: args.sessionApi,
    messageStore: args.messageStore ?? { findLatestMessageInfo: async () => undefined },
    logger: args.logger,
    backgroundTaskProbe: args.backgroundTaskProbe,
    countdownSeconds: args.countdownSeconds ?? 2,
  })
}
```

- [ ] **Step 8: 跑 unit + integration tests 確認通過**

Run: `bun test tests/unit/idle-decision.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected:
- `shouldContinueOnIdle` 測試通過
- integration test 看到 `sessionApi.prompts` 長度為 1，且保護情境不誤觸發

- [ ] **Step 9: Commit**

```bash
git add src/plugin/adapters/logger.ts src/plugin/adapters/background-task-probe.ts src/plugin/adapters/message-store.ts src/plugin/adapters/session-api.ts src/todo-continuation-enforcer/pending-question-detection.ts src/todo-continuation-enforcer/stagnation-detection.ts src/todo-continuation-enforcer/resolve-message-info.ts src/todo-continuation-enforcer/countdown.ts src/todo-continuation-enforcer/continuation-injection.ts src/todo-continuation-enforcer/idle-event.ts src/todo-continuation-enforcer/handler.ts src/todo-continuation-enforcer/index.ts tests/helpers/fakes.ts tests/unit/idle-decision.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts
git commit -m "feat: implement todo continuation decision and injection flow"
```

## Task 4: 把 feature 接回 plugin event 介面，補保護情境整合測試與最終驗證

**Files:**
- Create: `src/plugin/event-handler.ts`
- Modify: `src/plugin/create-plugin.ts`
- Modify: `tests/helpers/fakes.ts`
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Test: `bun test`

- [ ] **Step 1: 先擴充整合測試，覆蓋保護情境**

在 `tests/integration/todo-continuation-enforcer.integration.test.ts` 追加：

```ts
test("does not inject when latest message contains pending question", async () => {
  const sessionApi = createFakeSessionApi()
  sessionApi.getLatestMessageInfo = async () => ({
    agent: "sisyphus",
    model: { providerID: "openai", modelID: "gpt-5" },
    tools: { write: true, edit: true },
    question: "Which option should I choose?",
  })

  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    countdownSeconds: 0,
  })

  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

  expect(sessionApi.prompts).toHaveLength(0)
})

test("does not inject when background task is running", async () => {
  const sessionApi = createFakeSessionApi()
  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: { hasRunningTask: () => true },
    countdownSeconds: 0,
  })

  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

  expect(sessionApi.prompts).toHaveLength(0)
})

test("does not inject during cooldown", async () => {
  const sessionApi = createFakeSessionApi()
  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    countdownSeconds: 0,
  })

  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

  expect(sessionApi.prompts).toHaveLength(1)
})

test("increments consecutive failure count when injection throws", async () => {
  const sessionApi = createFakeSessionApi()
  sessionApi.injectPrompt = async () => {
    throw new Error("boom")
  }

  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    countdownSeconds: 0,
  })

  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

  expect(sessionApi.prompts).toHaveLength(0)
})
```

- [ ] **Step 2: 跑測試確認至少一個保護情境先失敗**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: 若 handler 尚未完整接線，至少一個新測試失敗

- [ ] **Step 3: 建立 plugin event handler**

`src/plugin/event-handler.ts`

```ts
export function createEventHandler(handleEvent: (event: { type: string; sessionID: string }) => Promise<void>) {
  return async function onEvent(input: { event: { type: string; properties?: Record<string, unknown> } }) {
    const sessionID = typeof input.event.properties?.sessionID === "string"
      ? input.event.properties.sessionID
      : typeof input.event.properties?.id === "string"
        ? input.event.properties.id
        : undefined

    if (!sessionID) return

    await handleEvent({
      type: input.event.type,
      sessionID,
    })
  }
}
```

- [ ] **Step 4: 修改 plugin factory，把 event handler 與 SDK adapter 接回來**

`src/plugin/create-plugin.ts`

```ts
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

import { createTodoContinuationEnforcer } from "../todo-continuation-enforcer"
import { createNoopBackgroundTaskProbe } from "./adapters/background-task-probe"
import { createConsoleLogger } from "./adapters/logger"
import { createNoopMessageStore } from "./adapters/message-store"
import { createSdkSessionApi } from "./adapters/session-api"
import { createEventHandler } from "./event-handler"

export function createPlugin(): Plugin {
  return async function TodoContinuationEnforcerPlugin(ctx: PluginInput) {
    const enforcer = createTodoContinuationEnforcer({
      sessionApi: createSdkSessionApi(ctx),
      messageStore: createNoopMessageStore(),
      logger: createConsoleLogger(),
      backgroundTaskProbe: createNoopBackgroundTaskProbe(),
    })

    return {
      name: "todo-continuation-enforcer",
      event: createEventHandler(enforcer.handleEvent),
    }
  }
}
```

- [ ] **Step 5: 讓 `createFakeSessionApi` 支援覆寫測試情境**

將 `tests/helpers/fakes.ts` 改成：

```ts
import type { SessionApi, MessageInfo } from "../../src/plugin/adapters/session-api"
import type { BackgroundTaskProbe } from "../../src/plugin/adapters/background-task-probe"
import type { Logger } from "../../src/plugin/adapters/logger"
import type { Todo } from "../../src/todo-continuation-enforcer/types"

export function createFakeLogger(): Logger {
  return { debug() {}, info() {}, warn() {} }
}

export function createFakeBackgroundTaskProbe(): BackgroundTaskProbe {
  return { hasRunningTask: () => false }
}

export function createFakeSessionApi(args?: {
  todos?: Todo[]
  latestMessageInfo?: MessageInfo
}): SessionApi {
  const prompts: string[] = []
  let latestMessageInfo = args?.latestMessageInfo ?? {
    agent: "sisyphus",
    model: { providerID: "openai", modelID: "gpt-5" },
    tools: { write: true, edit: true },
  }

  return {
    prompts,
    async getTodos() {
      return args?.todos ?? [{ content: "finish", status: "pending", priority: "high" }]
    },
    async getLatestMessageInfo() {
      return latestMessageInfo
    },
    async injectPrompt(_sessionID, prompt) {
      prompts.push(prompt)
    },
  }
}
```

- [ ] **Step 6: 跑全部驗證**

Run: `bun run typecheck && bun test && bun run build`

Expected:
- `bun run typecheck` 無錯誤
- `bun test` 全部通過
- `bun run build` 產出 `dist/index.js` 與型別宣告

- [ ] **Step 7: Commit**

```bash
git add src/plugin/event-handler.ts src/plugin/create-plugin.ts tests/helpers/fakes.ts tests/integration/todo-continuation-enforcer.integration.test.ts
git commit -m "feat: wire continuation handler into standalone plugin"
```

## Task 5: 手動載入驗證與收尾

**Files:**
- Modify: `README.md`
- Test: local plugin loading in OpenCode/OpenAgent

- [ ] **Step 1: 補 README 的本地載入與驗證段落**

在 `README.md` 追加：

```md
## Verification checklist

1. Build the plugin with `bun run build`
2. Point your local OpenCode/OpenAgent plugin loader at this repo
3. Start a session with at least one unfinished todo item
4. Let the session reach `session.idle`
5. Confirm the plugin injects a continuation prompt instead of stopping
6. Confirm it does not inject when the latest assistant message is a user-facing question
```

- [ ] **Step 2: 本地手動驗證**

Run:

```bash
bun run build
```

Then manually load the plugin in your local OpenCode/OpenAgent environment and verify:

- unfinished todo 時 idle 會續跑
- pending question 時不續跑
- background task running 時不續跑

Expected: 手動驗證至少覆蓋 1 個正向情境與 2 個保護情境

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add standalone plugin verification steps"
```

## Spec Coverage Check

- 專案骨架與 plugin 入口 -> Task 1, Task 4
- adapters 定義與最小宿主接線 -> Task 3, Task 4
- continuation feature 搬移 / 改寫 -> Task 2, Task 3
- 基本測試與本地驗證 -> Task 2, Task 3, Task 4, Task 5
- idle gate / pending question / abort / cooldown / background task / skip agent / compaction guard -> Task 3 與 Task 4 的 decision logic 與測試
- stagnation / consecutive failure 保護 -> Task 3 的 handler 實作與 Task 4 的 integration 情境

## Self-Review Notes

- 已避免 `TODO`、`TBD` 類 placeholder
- 所有程式步驟都提供實際檔案內容或追加內容
- 型別名稱在 tasks 間保持一致：`SessionApi`、`MessageInfo`、`SessionStateStore`、`createTodoContinuationEnforcer`
- 若 implementation 中發現 `@opencode-ai/plugin` 的 `event` handler 型別與計畫片段不同，優先在 Task 4 微調 adapter 與 handler signature，但不要改變整體檔案邊界
