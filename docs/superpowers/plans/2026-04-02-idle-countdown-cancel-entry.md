# Idle Countdown Cancel Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者在 agent 已 idle、ESC 無法透過 host 傳成 `session.interrupt` 時，仍有明確且可驗證的方式取消 pending continuation countdown。

**Architecture:** 保留既有 `session.interrupt` 路徑不變，另外把 plugin 的取消入口提升成對外可理解的使用方式：補文件與測試，必要時放寬 handler 的 pending 判定，確保 countdown/recheck 邊界都能取消。同時不假設 plugin 能收到 raw ESC。

**Tech Stack:** TypeScript, Bun test, OpenCode plugin SDK

---

### Task 1: Harden cancellation semantics

**Files:**
- Modify: `src/todo-continuation-enforcer/handler.ts`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("active countdown/recheck edge can still be cancelled through explicit cancel entry", async () => {
  // reproduce a pending continuation that is cancellable even if timer callback already advanced
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`
Expected: FAIL because the current handler reports `no_pending` or still injects.

- [ ] **Step 3: Write minimal implementation**

```ts
async cancelNextContinuation(sessionID: string) {
  // treat active timer/recheck window as cancellable, not only pendingContinuation === true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`
Expected: PASS for the new cancel-edge regression.

### Task 2: Document user-facing workaround for idle countdown

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add usage note**

```md
If OpenCode does not route `Escape` to `session_interrupt` after the session is already idle, use the explicit cancellation entry for the pending continuation instead of relying on raw ESC.
```

- [ ] **Step 2: Verify docs stay accurate**

Run: `bun test`
Expected: PASS with no behavior regressions.

### Task 3: Validate

**Files:**
- Modify: none

- [ ] **Step 1: Run diagnostics**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run full tests**

Run: `bun test`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS
