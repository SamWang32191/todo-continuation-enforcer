# Todo Continuation Enforcer Reference Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `todo-continuation-enforcer` 的主流程重新對齊參考 repo：`session.idle` 通過 gate 後進入 5 秒 toast countdown，結束後 inject continuation prompt；唯一刻意差異是 pending question 同時支援 `question` tool 與文字尾端 `?`。

**Architecture:** 保留現有 plugin shell + feature handler 架構，只擴充 `SessionApi` 的 message shape、增加一個薄 toast adapter，並把 countdown 從單純 wait 升級成有 UI 提示與取消控制的 runtime。整體以 TDD 先補行為測試，再最小調整 `pending-question-detection`、`countdown`、`handler` 與 plugin wiring。

**Tech Stack:** TypeScript, Bun, `bun:test`, `@opencode-ai/plugin`

---

## File Structure

### Files to Create

- `src/plugin/adapters/toast.ts` - 抽象 countdown toast 顯示與 SDK/no-op 實作
- `tests/unit/pending-question-detection.test.ts` - pending question 雙軌判定測試
- `tests/unit/countdown.test.ts` - countdown toast / cancel / cleanup 測試

### Files to Modify

- `src/plugin/create-plugin.ts` - 注入 toast adapter 與 5 秒 countdown 設定
- `src/plugin/adapters/session-api.ts` - 保留最後訊息 parts，讓 detection 可看 tool invocation
- `src/todo-continuation-enforcer/index.ts` - 接受 toast adapter 與預設 countdown 來源
- `src/todo-continuation-enforcer/types.ts` - 增加 message part / countdown notifier 型別
- `src/todo-continuation-enforcer/constants.ts` - countdown 預設改為 5 秒，必要時補 toast 常數
- `src/todo-continuation-enforcer/pending-question-detection.ts` - tool invocation + 尾問號雙軌判定
- `src/todo-continuation-enforcer/countdown.ts` - toast 顯示、每秒更新、可取消 countdown runtime
- `src/todo-continuation-enforcer/handler.ts` - countdown 結束後重新 inject continuation prompt
- `tests/helpers/fakes.ts` - fake toast adapter、帶 parts 的 fake message info
- `tests/integration/todo-continuation-enforcer.integration.test.ts` - 主流程對齊參考 repo 的整合測試
- `tests/unit/continuation-injection.test.ts` - 確認 prompt 內容仍正確

### Resulting Boundaries

- `session-api.ts` 只負責正規化最後訊息的文字與 parts，不做判定
- `pending-question-detection.ts` 只根據 `MessageInfo` 決定是否等待使用者
- `countdown.ts` 只負責 countdown lifecycle 與 toast 顯示
- `handler.ts` 維持 orchestration：gate -> countdown -> recheck -> inject
- `toast.ts` 讓宿主有 TUI 時顯示 toast，沒有時安全降級

## Task 1: 先用 TDD 補齊 pending question 雙軌判定

**Files:**
- Create: `tests/unit/pending-question-detection.test.ts`
- Modify: `src/plugin/adapters/session-api.ts`
- Modify: `src/todo-continuation-enforcer/pending-question-detection.ts`
- Modify: `src/todo-continuation-enforcer/types.ts`
- Modify: `tests/helpers/fakes.ts`

- [ ] **Step 1: 寫 `pending-question-detection` 的 failing tests**

```ts
import { describe, expect, it } from "bun:test"

import { hasPendingQuestion } from "../../src/todo-continuation-enforcer/pending-question-detection"

describe("hasPendingQuestion", () => {
  it("assistant 最後訊息含 question tool invocation 時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        parts: [{ type: "tool_use", name: "question" }],
      }),
    ).toBe(true)
  })

  it("assistant 文字以問號結尾時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        text: "Should I continue?",
        parts: [{ type: "text", text: "Should I continue?" }],
      }),
    ).toBe(true)
  })

  it("一般 assistant 敘述時回傳 false", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        text: "Continuing now.",
        parts: [{ type: "text", text: "Continuing now." }],
      }),
    ).toBe(false)
  })

  it("最後訊息是 user 時回傳 false", () => {
    expect(
      hasPendingQuestion({
        role: "user",
        text: "Please continue",
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 跑單元測試確認目前失敗**

Run: `bun test tests/unit/pending-question-detection.test.ts`

Expected: FAIL，錯誤指出 `parts` 型別缺失，或 `hasPendingQuestion()` 尚未支援 `tool_use` / `tool-invocation`。

- [ ] **Step 3: 擴充 message part 型別與 SDK message normalization**

`src/plugin/adapters/session-api.ts`

```ts
export interface MessagePartInfo {
  type: string
  name?: string
  toolName?: string
  text?: string
  prompt?: string
}

export interface MessageInfo {
  agent?: string
  model?: { providerID: string; modelID: string }
  tools?: Record<string, boolean>
  text?: string
  role?: "user" | "assistant"
  error?: { name?: string }
  parts?: MessagePartInfo[]
}

function normalizeParts(parts: SdkMessage["parts"]): MessagePartInfo[] | undefined {
  const normalized = parts
    ?.filter(isSdkMessagePart)
    .map((part) => ({
      type: part.type,
      text: part.text,
      prompt: part.prompt,
      name: typeof (part as Record<string, unknown>).name === "string"
        ? (part as Record<string, string>).name
        : undefined,
      toolName: typeof (part as Record<string, unknown>).toolName === "string"
        ? (part as Record<string, string>).toolName
        : undefined,
    }))

  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeMessageInfo(message: SdkMessage | undefined): MessageInfo | undefined {
  return {
    agent: message.info.agent,
    model: message.info.model?.providerID && message.info.model?.modelID
      ? {
          providerID: message.info.model.providerID,
          modelID: message.info.model.modelID,
        }
      : undefined,
    error: message.info.error ? { name: message.info.error.name } : undefined,
    role: getMessageRole(role),
    text,
    parts: normalizeParts(message.parts),
  }
}
```

`src/todo-continuation-enforcer/types.ts`

```ts
export interface MessagePartInfo {
  type: string
  name?: string
  toolName?: string
  text?: string
  prompt?: string
}
```

- [ ] **Step 4: 實作雙軌 pending question 判定**

`src/todo-continuation-enforcer/pending-question-detection.ts`

```ts
import type { MessageInfo } from "../plugin/adapters/session-api"

function hasQuestionToolInvocation(messageInfo: MessageInfo): boolean {
  return Boolean(
    messageInfo.parts?.some(
      (part) =>
        (part.type === "tool_use" || part.type === "tool-invocation")
        && (part.name === "question" || part.toolName === "question"),
    ),
  )
}

export function hasPendingQuestion(messageInfo: MessageInfo | undefined): boolean {
  if (messageInfo?.role !== "assistant") {
    return false
  }

  if (hasQuestionToolInvocation(messageInfo)) {
    return true
  }

  const text = messageInfo.text?.trim()
  return Boolean(text && /\?\s*$/.test(text))
}
```

- [ ] **Step 5: 更新 fake builders 支援 `parts`**

`tests/helpers/fakes.ts`

```ts
return {
  agent: "sisyphus",
  model: { providerID: "openai", modelID: "gpt-5" },
  tools: { write: true, edit: true },
  parts: [{ type: "text", text: "Continuing now." }],
}
```

- [ ] **Step 6: 重跑單元測試確認通過**

Run: `bun test tests/unit/pending-question-detection.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/unit/pending-question-detection.test.ts src/plugin/adapters/session-api.ts src/todo-continuation-enforcer/pending-question-detection.ts src/todo-continuation-enforcer/types.ts tests/helpers/fakes.ts
git commit -m "feat: broaden pending question detection"
```

## Task 2: 用 TDD 把 countdown 升級成 5 秒 toast countdown

**Files:**
- Create: `src/plugin/adapters/toast.ts`
- Create: `tests/unit/countdown.test.ts`
- Modify: `src/plugin/create-plugin.ts`
- Modify: `src/todo-continuation-enforcer/index.ts`
- Modify: `src/todo-continuation-enforcer/constants.ts`
- Modify: `src/todo-continuation-enforcer/countdown.ts`
- Modify: `src/todo-continuation-enforcer/types.ts`
- Modify: `tests/helpers/fakes.ts`

- [ ] **Step 1: 寫 countdown toast/cancel 的 failing tests**

```ts
import { describe, expect, it } from "bun:test"

import { runCountdown } from "../../src/todo-continuation-enforcer/countdown"

describe("runCountdown", () => {
  it("啟動後會立即顯示第一個 toast 並在完成時回傳 true", async () => {
    const calls: string[] = []
    const state = { stagnationCount: 0, consecutiveFailures: 0 }

    const result = await runCountdown({
      seconds: 1,
      incompleteCount: 3,
      state,
      toast: {
        async showCountdown(message) {
          calls.push(message)
        },
      },
    })

    expect(result).toBe(true)
    expect(calls[0]).toContain("Resuming in 1s")
  })

  it("被 cancel 時回傳 false 並清掉 countdown handle", async () => {
    const state = { stagnationCount: 0, consecutiveFailures: 0 }

    const pending = runCountdown({
      seconds: 5,
      incompleteCount: 2,
      state,
      toast: { async showCountdown() {} },
    })

    state.countdownCancel?.()

    await expect(pending).resolves.toBe(false)
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
    expect(state.countdownCancel).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑 countdown 單元測試確認失敗**

Run: `bun test tests/unit/countdown.test.ts`

Expected: FAIL，因為 `runCountdown()` 尚未接受 toast/incompleteCount 參數，也沒有 interval 清理邏輯。

- [ ] **Step 3: 建立 toast adapter**

`src/plugin/adapters/toast.ts`

```ts
import type { PluginInput } from "@opencode-ai/plugin"

export interface CountdownToast {
  showCountdown(message: string): Promise<void>
}

export function createSdkCountdownToast(ctx: PluginInput): CountdownToast {
  return {
    async showCountdown(message) {
      await ctx.client.tui?.showToast?.({
        body: {
          title: "Todo Continuation",
          message,
          variant: "warning",
          duration: 900,
        },
      }).catch(() => {})
    },
  }
}

export function createNoopCountdownToast(): CountdownToast {
  return {
    async showCountdown() {},
  }
}
```

- [ ] **Step 4: 將 plugin wiring 接上 toast adapter 與 5 秒預設值**

`src/plugin/create-plugin.ts`

```ts
import { createNoopCountdownToast, createSdkCountdownToast } from "./adapters/toast"

const toast = ctx.client.tui ? createSdkCountdownToast(ctx) : createNoopCountdownToast()

const enforcer = createTodoContinuationEnforcer({
  sessionApi: createSdkSessionApi(ctx),
  messageStore: createNoopMessageStore(),
  logger: createConsoleLogger(),
  backgroundTaskProbe: createNoopBackgroundTaskProbe(),
  countdownSeconds: 5,
  toast,
})
```

`src/todo-continuation-enforcer/index.ts`

```ts
import type { CountdownToast } from "../plugin/adapters/toast"

export function createTodoContinuationEnforcer(args: {
  sessionApi: SessionApi
  messageStore?: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast?: CountdownToast
  countdownSeconds?: number
  skipAgents?: string[]
}) {
  return createTodoContinuationHandler({
    sessionApi: args.sessionApi,
    messageStore: args.messageStore ?? {
      async findLatestMessageInfo() {
        return undefined
      },
    },
    logger: args.logger,
    backgroundTaskProbe: args.backgroundTaskProbe,
    toast: args.toast,
    countdownSeconds: args.countdownSeconds ?? COUNTDOWN_SECONDS,
    skipAgents: args.skipAgents,
  })
}
```

- [ ] **Step 5: 實作 countdown runtime**

`src/todo-continuation-enforcer/countdown.ts`

```ts
import type { CountdownToast } from "../plugin/adapters/toast"
import type { SessionState } from "./types"

function getCountdownMessage(seconds: number, incompleteCount: number): string {
  return `Resuming in ${seconds}s... (${incompleteCount} tasks remaining)`
}

export async function runCountdown(args: {
  seconds: number
  incompleteCount: number
  state?: SessionState
  toast?: CountdownToast
}): Promise<boolean> {
  if (args.seconds <= 0) {
    return true
  }

  let secondsRemaining = args.seconds
  await args.toast?.showCountdown(getCountdownMessage(secondsRemaining, args.incompleteCount))

  return await new Promise<boolean>((resolve) => {
    let settled = false

    const cleanup = () => {
      if (args.state?.countdownTimer) clearTimeout(args.state.countdownTimer)
      if (args.state?.countdownInterval) clearInterval(args.state.countdownInterval)
      if (args.state) {
        args.state.countdownTimer = undefined
        args.state.countdownInterval = undefined
        if (args.state.countdownCancel === cancel) {
          args.state.countdownCancel = undefined
        }
      }
    }

    const complete = (value: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const cancel = () => complete(false)

    const interval = setInterval(() => {
      secondsRemaining -= 1
      if (secondsRemaining > 0) {
        void args.toast?.showCountdown(getCountdownMessage(secondsRemaining, args.incompleteCount))
      }
    }, 1000)

    const timer = setTimeout(() => complete(true), args.seconds * 1000)

    if (args.state) {
      args.state.countdownTimer = timer
      args.state.countdownInterval = interval
      args.state.countdownCancel = cancel
    }
  })
}
```

- [ ] **Step 6: 更新常數與 fake toast**

`src/todo-continuation-enforcer/constants.ts`

```ts
export const COUNTDOWN_SECONDS = 5
export const TOAST_DURATION_MS = 900
```

`tests/helpers/fakes.ts`

```ts
export function createFakeCountdownToast() {
  const messages: string[] = []

  return {
    messages,
    async showCountdown(message: string) {
      messages.push(message)
    },
  }
}
```

- [ ] **Step 7: 重跑 countdown 測試確認通過**

Run: `bun test tests/unit/countdown.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/plugin/adapters/toast.ts src/plugin/create-plugin.ts src/todo-continuation-enforcer/index.ts src/todo-continuation-enforcer/constants.ts src/todo-continuation-enforcer/countdown.ts tests/unit/countdown.test.ts tests/helpers/fakes.ts
git commit -m "feat: add countdown toast flow"
```

## Task 3: 用 TDD 恢復 countdown 後 inject 的主流程

**Files:**
- Modify: `src/todo-continuation-enforcer/handler.ts`
- Modify: `src/todo-continuation-enforcer/continuation-injection.ts`
- Modify: `tests/unit/continuation-injection.test.ts`
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Modify: `tests/helpers/fakes.ts`

- [ ] **Step 1: 先把整合測試改成參考 repo 主線的 failing tests**

在 `tests/integration/todo-continuation-enforcer.integration.test.ts` 新增或改寫這幾個案例：

```ts
it("idle 且有 incomplete todo 時會在 countdown 完成後 inject continuation", async () => {
  const sessionApi = createFakeSessionApi()
  const toast = createFakeCountdownToast()

  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    toast,
    countdownSeconds: 0,
  })

  await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

  expect(sessionApi.prompts).toHaveLength(1)
  expect(sessionApi.prompts[0]).toContain("Incomplete tasks remain")
})

it("question tool pending 時不 inject", async () => {
  const sessionApi = createFakeSessionApi({
    latestMessageInfo: {
      role: "assistant",
      parts: [{ type: "tool_use", name: "question" }],
      text: "",
    },
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

it("assistant 問句結尾時不 inject", async () => {
  const sessionApi = createFakeSessionApi({
    latestMessageInfo: {
      role: "assistant",
      text: "Should I continue?",
      parts: [{ type: "text", text: "Should I continue?" }],
    },
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
```

- [ ] **Step 2: 跑整合測試確認目前失敗**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: FAIL，因為目前 eligible idle 不會 inject，且 fake message shape 尚未完整支援新判定。

- [ ] **Step 3: 恢復 handler 的 inject path**

`src/todo-continuation-enforcer/handler.ts`

```ts
const countdownCompleted = await runCountdown({
  seconds: args.countdownSeconds,
  incompleteCount: decision.incompleteCount,
  state,
  toast: args.toast,
})

if (!countdownCompleted || !stateStore.getExistingState(event.sessionID)) {
  return
}

const freshTodos = await args.sessionApi.getTodos(event.sessionID)
const freshMessageInfo = await resolveMessageInfo({
  sessionID: event.sessionID,
  sessionApi: args.sessionApi,
  messageStore: args.messageStore,
})
const freshDecision = await shouldContinueOnIdle({
  sessionID: event.sessionID,
  state: { ...state, inFlight: false },
  todos: freshTodos,
  now: Date.now(),
  hasPendingQuestion: hasPendingQuestion(freshMessageInfo),
  hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(event.sessionID),
  isContinuationStopped: false,
  agent: freshMessageInfo?.agent,
  skipAgents: args.skipAgents,
})

if (!freshDecision.shouldInject) {
  args.logger.debug("skip continuation after recheck", freshDecision)
  return
}

await injectContinuation({
  sessionID: event.sessionID,
  sessionApi: args.sessionApi,
  todos: freshTodos,
  agent: freshMessageInfo?.agent,
  model: freshMessageInfo?.model,
})

commitStagnationState(state, stagnationPreview)
state.lastInjectedAt = Date.now()
state.awaitingPostInjectionProgressCheck = true
state.consecutiveFailures = 0
```

- [ ] **Step 4: 補 prompt 內容測試避免 regression**

`tests/unit/continuation-injection.test.ts`

```ts
it("prompt 會包含 continuation directive 與 remaining todos", async () => {
  let prompt = ""

  const sessionApi: SessionApi = {
    async getTodos() { return [] },
    async getLatestMessageInfo() { return undefined },
    async injectPrompt(_sessionID, nextPrompt) {
      prompt = nextPrompt
    },
  }

  await injectContinuation({
    sessionID: "s1",
    sessionApi,
    todos: [{ content: "finish", status: "pending", priority: "normal" }],
  })

  expect(prompt).toContain("TODO_CONTINUATION")
  expect(prompt).toContain("Remaining todos")
  expect(prompt).toContain("[pending] finish")
})
```

- [ ] **Step 5: 重跑相關測試確認通過**

Run: `bun test tests/unit/continuation-injection.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/todo-continuation-enforcer/handler.ts src/todo-continuation-enforcer/continuation-injection.ts tests/unit/continuation-injection.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts tests/helpers/fakes.ts
git commit -m "feat: restore continuation injection after countdown"
```

## Task 4: 補齊取消事件與最終驗證

**Files:**
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Modify: `tests/unit/idle-decision.test.ts`

- [ ] **Step 1: 補取消事件與 toast 文案的 failing tests**

在 `tests/integration/todo-continuation-enforcer.integration.test.ts` 補這些案例：

```ts
it("countdown 期間 session.error 會取消 inject", async () => {
  const sessionApi = createFakeSessionApi()
  const toast = createFakeCountdownToast()

  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    toast,
    countdownSeconds: 0.05,
  })

  const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  await enforcer.handleEvent({ type: "session.error", sessionID: "s1", error: { name: "AbortError" } })
  await idle

  expect(sessionApi.prompts).toHaveLength(0)
})

it("5 秒 countdown 會顯示對應 toast 文案", async () => {
  const sessionApi = createFakeSessionApi()
  const toast = createFakeCountdownToast()

  const enforcer = createTodoContinuationEnforcer({
    sessionApi,
    logger: createFakeLogger(),
    backgroundTaskProbe: createFakeBackgroundTaskProbe(),
    toast,
    countdownSeconds: 5,
  })

  void enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(toast.messages[0]).toContain("Resuming in 5s")
})
```

- [ ] **Step 2: 跑取消事件與 idle gate 測試確認失敗**

Run: `bun test tests/unit/idle-decision.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: FAIL，至少一個案例會因 countdown / toast / inject 路徑仍未完全對齊而失敗。

- [ ] **Step 3: 最小修正測試與實作落差**

優先修正這些常見落差：

```ts
// handler args 增加 toast
export function createTodoContinuationHandler(args: {
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast?: CountdownToast
  countdownSeconds: number
  skipAgents?: string[]
})

// error/compacted/deleted 時保持 countdownCancel() 清理
if (state.countdownCancel) {
  state.countdownCancel()
}
```

如果 `idle-decision.test.ts` 需反映問句 fallback，可補：

```ts
it("pending question 會阻擋", async () => {
  const result = await shouldContinueOnIdle({
    sessionID: "s1",
    state: baseState(),
    todos: [{ content: "finish", status: "pending", priority: "high" }],
    now: 10_000,
    hasPendingQuestion: true,
    hasRunningBackgroundTask: false,
    isContinuationStopped: false,
    agent: "sisyphus",
  })

  expect(result.shouldInject).toBe(false)
  expect(result.reason).toBe("pending_question")
})
```

- [ ] **Step 4: 跑完整驗證**

Run: `bun test && bun run typecheck`

Expected:
- `bun test` 全綠
- `bun run typecheck` 無 TypeScript error

- [ ] **Step 5: Commit**

```bash
git add tests/integration/todo-continuation-enforcer.integration.test.ts tests/unit/idle-decision.test.ts src/plugin/create-plugin.ts src/todo-continuation-enforcer/handler.ts
git commit -m "test: cover countdown cancellation and toast flow"
```
