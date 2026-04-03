# Stop Continuation Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 plugin 從 cancel-next-only 重構成 stop-only continuation guard，讓 stop 狀態可持續到新的 user message，並在 stop 時呼叫 `session.abort` 中止當前 session 執行。

**Architecture:** 新增獨立的 `stop-continuation-guard` 模組作為 stop 狀態唯一來源，plugin 透過 `event`、`chat.message`、`tool` 三條入口收斂到同一個 `stop(sessionID)` domain action。`todo-continuation-enforcer` 改為只管理 continuation runtime state，所有關鍵 gate 透過注入的 `isContinuationStopped(sessionID)` 檢查 stop 狀態。

**Tech Stack:** TypeScript, Bun test, `@opencode-ai/plugin@1.3.13`, `@opencode-ai/sdk@1.3.13`

---

## File Map

- Create: `src/stop-continuation-guard/hook.ts` — stop state store 與 `stop/isStopped/clear/event/chat.message` 邏輯
- Create: `src/plugin/chat-message-handler.ts` — 將 plugin `chat.message` hook 收斂到 guard clear 路徑
- Modify: `src/plugin/create-plugin.ts` — 建立 guard、註冊 `chat.message` hook、切換 tool/command wiring
- Modify: `src/plugin/event-handler.ts` — 將 `/stop-continuation` command 收斂到 `session.interrupt` 或新的 stop domain event
- Modify: `src/plugin/command-definitions.ts` — 將 command 名稱與模板改為 stop-only 語意
- Modify: `src/plugin/adapters/session-api.ts` — 新增 `abort(sessionID)`
- Modify: `src/todo-continuation-enforcer/index.ts` — 注入 `isContinuationStopped`
- Modify: `src/todo-continuation-enforcer/handler.ts` — 移除 `continuationStopped` 主責，新增 `cancelPendingWork` 與 stop gate
- Modify: `src/todo-continuation-enforcer/session-state.ts` — 清掉對持久 stop state 的依賴
- Modify: `src/todo-continuation-enforcer/types.ts` — 拿掉或降級 `continuationStopped` 欄位
- Modify: `tests/helpers/fakes.ts` — fake `SessionApi` 增加 `abort` 追蹤，必要時增加 stop guard 測試輔助
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts` — 改寫 command/tool/idle/stop/chat.message/session.deleted 整合測試

### Task 1: 加入 stop guard 與 chat.message 清除路徑

**Files:**
- Create: `src/stop-continuation-guard/hook.ts`
- Create: `src/plugin/chat-message-handler.ts`
- Create: `tests/unit/stop-continuation-guard.test.ts`

- [ ] **Step 1: 寫 stop guard 的失敗測試**

先新增 `tests/unit/stop-continuation-guard.test.ts`，直接測 guard 模組與 `chat.message` handler：

```ts
it("stop 後 isStopped 會變 true，chatMessage 後清掉", async () => {
  const guard = createStopContinuationGuard()

  guard.stop("s1")
  expect(guard.isStopped("s1")).toBe(true)

  await guard.chatMessage({ sessionID: "s1" })
  expect(guard.isStopped("s1")).toBe(false)
})

it("session.deleted 會清掉 stop state", async () => {
  const guard = createStopContinuationGuard()

  guard.stop("s1")
  expect(guard.isStopped("s1")).toBe(true)

  await guard.event({ event: { type: "session.deleted", properties: { info: { id: "s1" } } } })
  expect(guard.isStopped("s1")).toBe(false)
})

it("chat.message handler 會把 sessionID 傳給 clear 函式", async () => {
  const calls: string[] = []
  const handler = createChatMessageHandler(async (sessionID) => {
    calls.push(sessionID)
  })

  await handler(
    { sessionID: "s1", agent: "sisyphus" },
    { message: { role: "user" } as never, parts: [{ type: "text", text: "continue" }] as never },
  )

  expect(calls).toEqual(["s1"])
})
```

- [ ] **Step 2: 跑測試，確認真的失敗**

Run: `bun test tests/unit/stop-continuation-guard.test.ts`

Expected: FAIL，因為目前還沒有 `stop-continuation-guard` 模組與 `chat.message` handler。

- [ ] **Step 3: 建立 stop guard 模組**

新增 `src/stop-continuation-guard/hook.ts`：

```ts
export interface StopContinuationGuard {
  stop(sessionID: string): void
  isStopped(sessionID: string): boolean
  clear(sessionID: string): void
  event(input: { event: { type: string; properties?: unknown } }): Promise<void>
  chatMessage(input: { sessionID: string }): Promise<void>
}

export function createStopContinuationGuard(): StopContinuationGuard {
  const stoppedSessions = new Map<string, { stoppedAt: number }>()

  return {
    stop(sessionID) {
      stoppedSessions.set(sessionID, { stoppedAt: Date.now() })
    },
    isStopped(sessionID) {
      return stoppedSessions.has(sessionID)
    },
    clear(sessionID) {
      stoppedSessions.delete(sessionID)
    },
    async event({ event }) {
      const props = (event.properties ?? {}) as { info?: { id?: string } }
      if (event.type === "session.deleted" && props.info?.id) {
        stoppedSessions.delete(props.info.id)
      }
    },
    async chatMessage({ sessionID }) {
      stoppedSessions.delete(sessionID)
    },
  }
}
```

- [ ] **Step 4: 建立 chat.message handler**

新增 `src/plugin/chat-message-handler.ts`：

```ts
import type { Hooks } from "@opencode-ai/plugin"

export function createChatMessageHandler(clearStop: (sessionID: string) => Promise<void>): NonNullable<Hooks["chat.message"]> {
  return async (input) => {
    await clearStop(input.sessionID)
  }
}
```

- [ ] **Step 5: 重新跑 unit 測試確認行為綠燈**

Run: `bun test tests/unit/stop-continuation-guard.test.ts`

Expected: 新增的 guard 與 `chat.message` handler 測試 PASS。

### Task 2: 切換 command/tool/session API 到 stop-only 語意

> Note: Task 2 與 Task 3 共享 `createPlugin` / enforcer 邊界。若在 Task 2 落地過程已引入 guard scaffolding，實作時應直接連續執行 Task 3，避免留下「已宣告 stop-only API，但核心 flow 尚未消費 guard state」的半套狀態。

**Files:**
- Modify: `src/plugin/command-definitions.ts`
- Modify: `src/plugin/event-handler.ts`
- Modify: `src/plugin/create-plugin.ts`
- Modify: `src/plugin/adapters/session-api.ts`
- Modify: `tests/helpers/fakes.ts`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 寫失敗測試覆蓋新的外部 API**

在整合測試加入：

```ts
it("tui.command.execute 的 stop-continuation 會轉給 stop flow", async () => {
  const calls: Array<{ type: string; sessionID: string }> = []
  const handler = createEventHandler(async (event) => {
    calls.push(event)
  })

  await handler({
    event: {
      type: "tui.command.execute",
      properties: { sessionID: "s1", command: "stop-continuation" },
    } as never,
  })

  expect(calls).toEqual([{ type: "session.interrupt", sessionID: "s1" }])
})

it("stop_continuation tool 會優先使用 context.sessionID 並呼叫 session.abort", async () => {
  const sessionApi = createFakeSessionApi()
  const plugin = createPlugin({ countdownSeconds: 0 })
  const hooks = await plugin(createPluginContext(sessionApi))

  const result = await hooks.tool?.stop_continuation.execute({}, { sessionID: "s1" } as never)

  expect(result).toBe("Stopped continuation for session s1.")
  expect(sessionApi.abortCalls).toEqual(["s1"])
})
```

- [ ] **Step 2: 跑測試，確認 API 尚未完成而失敗**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: FAIL，因為 command 名稱與 tool 名稱仍是舊的 cancel-next。

- [ ] **Step 3: 改 command 定義與 event 判斷**

更新 `src/plugin/command-definitions.ts` 與 `src/plugin/event-handler.ts`：

```ts
export const STOP_CONTINUATION_COMMAND_NAME = "stop-continuation"

const STOP_CONTINUATION_TEMPLATE = `Stop continuation for the current session.

Use the internal \`stop_continuation\` tool to stop continuation and abort the active session run.

- Prefer the current session context.
- If continuation is already stopped, tell the user it is already stopped.
- Confirm that continuation is stopped for this session.`
```

```ts
function isSessionInterruptCommand(event: unknown): boolean {
  // ...existing guards...
  return properties?.command === "session.interrupt"
    || properties?.command === STOP_CONTINUATION_COMMAND_NAME
}
```

- [ ] **Step 4: 擴充 SessionApi 與 fake**

更新 `src/plugin/adapters/session-api.ts` 與 `tests/helpers/fakes.ts`：

```ts
export interface SessionApi {
  getTodos(sessionID: string): Promise<Todo[]>
  getLatestMessageInfo(sessionID: string): Promise<MessageInfo | undefined>
  injectPrompt(sessionID: string, prompt: string, options?: { agent?: string; model?: { providerID: string; modelID: string } }): Promise<void>
  abort(sessionID: string): Promise<void>
}
```

```ts
async abort(sessionID) {
  await ctx.client.session.abort({
    path: { id: sessionID },
    query: { directory: ctx.directory },
  })
}
```

```ts
const abortCalls: string[] = []

async abort(sessionID) {
  abortCalls.push(sessionID)
}
```

- [ ] **Step 5: 改 createPlugin wiring**

在 `src/plugin/create-plugin.ts` 建立 guard，註冊新 tool 與 `chat.message` hook：

```ts
const guard = createStopContinuationGuard()

return {
  config: handleConfig,
  event: createEventHandler(async (event) => {
    await guard.event({ event: { type: event.type, properties: { info: { id: event.sessionID } } } })
    await enforcer.handleEvent(event)
  }),
  "chat.message": createChatMessageHandler(async (sessionID) => {
    await guard.chatMessage({ sessionID })
  }),
  tool: {
    stop_continuation: tool({
      description: "Stop continuation for the current session",
      args: { sessionID: tool.schema.string().optional() },
      async execute(input, context) {
        const sessionID = input.sessionID ?? context.sessionID
        await guard.stop(sessionID)
        await enforcer.cancelPendingWork(sessionID)
        await sessionApi.abort(sessionID)
        return `Stopped continuation for session ${sessionID}.`
      },
    }),
  },
}
```

- [ ] **Step 6: 跑整合測試確認 API 與 abort wiring 正常**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: `stop-continuation` command 與 `stop_continuation` tool 相關測試 PASS。

### Task 3: 重構 enforcer，讓 stop state 從 guard 注入

> Note: 若 Task 2 已經完成 stop-only command/tool 與 guard wiring，Task 3 應立刻接續完成 `isContinuationStopped(sessionID)` gate，兩者不建議拆成相隔很久的獨立提交。

**Files:**
- Modify: `src/todo-continuation-enforcer/index.ts`
- Modify: `src/todo-continuation-enforcer/handler.ts`
- Modify: `src/todo-continuation-enforcer/session-state.ts`
- Modify: `src/todo-continuation-enforcer/types.ts`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 寫失敗測試覆蓋 countdown 中 stop 與 inject 前 stop**

加兩個測試：

```ts
it("countdown 中 stop 會取消 pending continuation 並阻止 inject", async () => {
  clock = createControlledClock()
  const sessionApi = createFakeSessionApi()
  const plugin = createPlugin({ countdownSeconds: 10 })
  const hooks = await plugin(createPluginContext(sessionApi))

  const idle = hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })
  await clock.advance(1000)
  await hooks.tool?.stop_continuation.execute({}, { sessionID: "s1" } as never)
  await clock.advance(10000)
  await idle

  expect(sessionApi.prompts).toHaveLength(0)
})

it("countdown 完成後 inject 前 stop 仍會阻止 inject", async () => {
  clock = createControlledClock()
  const sessionApi = createMutableFakeSessionApi()
  const plugin = createPlugin({ countdownSeconds: 1 })
  const hooks = await plugin(createPluginContext(sessionApi))

  const idle = hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })
  await clock.advance(1000)
  await hooks.tool?.stop_continuation.execute({}, { sessionID: "s1" } as never)
  await idle

  expect(sessionApi.prompts).toHaveLength(0)
})
```

- [ ] **Step 2: 跑測試，確認目前 enforcer 尚未完全擋住 race**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: FAIL，因為 `handler.ts` 仍依賴 `continuationStopped` 與舊的 cancel-next semantics。

- [ ] **Step 3: 改 enforcer 入口與型別**

更新 `src/todo-continuation-enforcer/index.ts` 與 `src/todo-continuation-enforcer/types.ts`：

```ts
export function createTodoContinuationEnforcer(args: {
  sessionApi: SessionApi
  messageStore?: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast?: CountdownToast
  countdownSeconds?: number
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
})
```

```ts
export interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>
  countdownInterval?: ReturnType<typeof setInterval>
  countdownCancel?: () => void
  pendingContinuation?: boolean
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

- [ ] **Step 4: 在 handler 中新增 `cancelPendingWork` 與 stop gate**

更新 `src/todo-continuation-enforcer/handler.ts`：

```ts
async function cancelPendingWork(sessionID: string): Promise<void> {
  const state = stateStore.getExistingState(sessionID)
  if (!state) return
  state.pendingContinuation = false
  state.countdownCancel?.()
  await args.toast.showCancelled("Continuation stopped.")
}
```

```ts
if (args.isContinuationStopped?.(event.sessionID)) {
  return
}
```

把這個 gate 放在：
- `session.idle` 開頭
- `runCountdown()` 前
- fresh recheck 前
- inject 前

並在 `finally` 中移除：

```ts
state.continuationStopped = false
```

- [ ] **Step 5: 更新 SessionStateStore 清理邏輯**

更新 `src/todo-continuation-enforcer/session-state.ts`：

```ts
private createState(sessionId: string): SessionState {
  return {
    countdownStartedAt: Date.now(),
    lastIncompleteCount: 0,
    lastInjectedAt: undefined,
    awaitingPostInjectionProgressCheck: false,
    inFlight: false,
    countdownCancel: undefined,
    pendingContinuation: false,
    stagnationCount: 0,
    consecutiveFailures: 0,
    recentCompactionAt: undefined,
    recentCompactionEpoch: undefined,
    acknowledgedCompactionEpoch: undefined,
  }
}
```

- [ ] **Step 6: 跑整合測試確認 race-sensitive stop 場景通過**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: countdown 中 stop、inject 前 stop、sticky stop 測試 PASS。

### Task 4: 清理相容邊界與完成驗證

**Files:**
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Modify: `src/plugin/create-plugin.ts`
- Modify: `src/plugin/event-handler.ts`
- Modify: `src/plugin/command-definitions.ts`

- [ ] **Step 1: 補齊 idempotent stop 與回傳文案測試**

在整合測試加入：

```ts
it("重複 stop 同一 session 仍回成功", async () => {
  const sessionApi = createFakeSessionApi()
  const plugin = createPlugin({ countdownSeconds: 0 })
  const hooks = await plugin(createPluginContext(sessionApi))

  const first = await hooks.tool?.stop_continuation.execute({}, { sessionID: "s1" } as never)
  const second = await hooks.tool?.stop_continuation.execute({}, { sessionID: "s1" } as never)

  expect(first).toBe("Stopped continuation for session s1.")
  expect(second).toBe("Continuation already stopped for session s1.")
  expect(sessionApi.abortCalls).toEqual(["s1", "s1"])
})
```

- [ ] **Step 2: 抽出重複測試 setup 成 helper（若 Step 1 尚未一併完成）**

若 Step 1 已先把 `createPluginContext()` 補到檔案頂部，這一步只需確認所有新測試都改用該 helper，而不要再複製 plugin context 物件。

- [ ] **Step 3: 刪除或改寫舊 cancel-next 專屬測試**

把仍然要求 `cancel-next-continuation`、`cancel_next_continuation` 的測試改成 stop-only 對應版本，避免舊語意殘留。

需要替換的斷言模式：

```ts
"cancel-next-continuation"
"cancel_next_continuation"
"Cancelled next continuation"
"No pending continuation to cancel"
```

替換成：

```ts
"stop-continuation"
"stop_continuation"
"Stopped continuation for session"
"Continuation already stopped for session"
```

- [ ] **Step 4: 跑完整測試與型別檢查**

Run: `bun test`

Expected: 全部 PASS

Run: `bun run typecheck`

Expected: 無 type error

- [ ] **Step 5: 檢查工作樹差異**

Run: `git diff -- src tests docs/superpowers/specs docs/superpowers/plans`

Expected: 只包含本計畫涉及的 stop guard、plugin wiring、測試與設計/計畫文件。

## Self-Review Notes

- Spec coverage: stop guard、chat.message clear、session.abort、sticky stop、session.deleted cleanup、race-sensitive stop 測試都已映射到 Task 1-4
- Placeholder scan: 所有 task 都列出具體檔案、測試名、命令與預期
- Type consistency: plan 內統一使用 `stop_continuation`、`STOP_CONTINUATION_COMMAND_NAME`、`isContinuationStopped(sessionID)`、`SessionApi.abort(sessionID)`
