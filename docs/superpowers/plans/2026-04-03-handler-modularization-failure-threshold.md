# Handler Modularization and Failure Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆分 `handler.ts` 的核心流程、集中 countdown cleanup，並補上 failure threshold 直接回歸測試，同時維持既有對外行為不變。

**Architecture:** `handler.ts` 保留 factory 與事件路由；新的 `idle-cycle.ts` 負責 idle 主流程，`cleanup.ts` 負責非 idle cleanup 事件，`countdown-state.ts` 提供 countdown timer/interval/cancel 的共用收斂 helper。測試只補最小必要覆蓋，不擴大到 observability 或 adapter 重整。

**Tech Stack:** TypeScript, Bun, OpenCode plugin SDK, bun test

---

### Task 1: 抽出 countdown state helper

**Files:**
- Create: `src/todo-continuation-enforcer/countdown-state.ts`
- Modify: `src/todo-continuation-enforcer/countdown.ts`
- Modify: `src/todo-continuation-enforcer/session-state.ts`
- Test: `tests/unit/countdown.test.ts`
- Test: `tests/unit/session-state.test.ts`

- [ ] **Step 1: 先用現有 countdown / session state 測試鎖住行為**

Run: `bun test tests/unit/countdown.test.ts tests/unit/session-state.test.ts`
Expected: PASS，作為抽 helper 前的基線。

- [ ] **Step 2: 建立共用 helper**

```ts
// src/todo-continuation-enforcer/countdown-state.ts
import type { SessionState } from "./types"

export function clearCountdownResources(state?: SessionState): void {
  if (!state) return
  if (state.countdownTimer) {
    clearTimeout(state.countdownTimer)
    state.countdownTimer = undefined
  }
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval)
    state.countdownInterval = undefined
  }
  state.countdownCancel = undefined
}

export function cancelPendingContinuation(state?: SessionState): void {
  if (!state) return
  state.countdownCancel?.()
  clearCountdownResources(state)
  state.pendingContinuation = false
}
```

- [ ] **Step 3: 讓 countdown 與 session-state 共用 helper**

```ts
// countdown.ts
import { clearCountdownResources } from "./countdown-state"

// session-state.ts
import { cancelPendingContinuation, clearCountdownResources } from "./countdown-state"
```

- [ ] **Step 4: 跑聚焦測試確認抽 helper 不改行為**

Run: `bun test tests/unit/countdown.test.ts tests/unit/session-state.test.ts`
Expected: PASS

### Task 2: 把 idle 與 cleanup 流程從 handler.ts 拆開

**Files:**
- Create: `src/todo-continuation-enforcer/cleanup.ts`
- Create: `src/todo-continuation-enforcer/idle-cycle.ts`
- Modify: `src/todo-continuation-enforcer/handler.ts`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 先跑既有整合測試作為行為基線**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`
Expected: PASS

- [ ] **Step 2: 建立 cleanup module，吸收非 idle 事件收尾**

```ts
// src/todo-continuation-enforcer/cleanup.ts
export async function handleCleanupEvent(args: {
  event: ContinuationEvent
  stateStore: SessionStateStore
  toast: CountdownToast
}) {
  // interrupt / deleted / compacted / error cleanup
}
```

- [ ] **Step 3: 建立 idle-cycle module，吸收 precheck → countdown → recheck → inject**

```ts
// src/todo-continuation-enforcer/idle-cycle.ts
export async function runIdleCycle(args: {
  event: ContinuationEvent
  state: SessionState
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast: CountdownToast
  countdownSeconds: number
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
}): Promise<void> {
  // precheck -> stagnation preview -> countdown -> recheck -> inject
}
```

- [ ] **Step 4: 縮小 handler.ts 成為高層路由**

```ts
if (event.type === "session.idle") {
  await runIdleCycle(...)
  return
}

await handleCleanupEvent(...)
```

- [ ] **Step 5: 跑整合測試確認重構後行為仍一致**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`
Expected: PASS

### Task 3: 補 failure threshold 直接測試

**Files:**
- Modify: `tests/unit/idle-decision.test.ts`
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Modify: `src/todo-continuation-enforcer/idle-cycle.ts`（若測試驅動後需要微調流程）

- [ ] **Step 1: 先寫 unit test 驗證 gate**

```ts
it("too many failures 會阻擋", async () => {
  const result = await shouldContinueOnIdle({
    state: { ...baseState(), consecutiveFailures: 5 },
    todos: [{ content: "finish", status: "pending", priority: "high" }],
    now: 10_000,
    hasPendingQuestion: false,
    hasRunningBackgroundTask: false,
    isContinuationStopped: false,
    agent: "sisyphus",
  })

  expect(result.shouldInject).toBe(false)
  expect(result.reason).toBe("too_many_failures")
})
```

- [ ] **Step 2: 跑單元測試確認新增 case**

Run: `bun test tests/unit/idle-decision.test.ts`
Expected: PASS

- [ ] **Step 3: 寫 integration regression，連續失敗達門檻後不再 inject**

```ts
it("stops injecting after max consecutive failures", async () => {
  // arrange fake sessionApi.injectPrompt to throw repeatedly
  // fire session.idle enough times to hit the threshold
  // assert prompts stop increasing once the threshold is reached
})
```

- [ ] **Step 4: 跑聚焦整合測試**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`
Expected: PASS

### Task 4: 完整驗證

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: 跑完整型別檢查**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 2: 跑完整測試**

Run: `bun test`
Expected: all tests pass, 0 failures

- [ ] **Step 3: 更新規劃檔狀態**

```md
- 將 task_plan 各階段標記為 complete
- 在 progress 記錄重構完成與驗證結果
```
