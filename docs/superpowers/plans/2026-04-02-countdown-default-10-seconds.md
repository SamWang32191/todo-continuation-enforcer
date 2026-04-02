# Countdown Default 10 Seconds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 plugin 的預設 countdown 從 5 秒改為 10 秒，並同步更新對外文件與預設行為驗證。

**Architecture:** 此變更只調整 `createPlugin()` 的 fallback 值，不改動 countdown runtime 或 handler 流程。測試先改成驗證 10 秒預設文案，再做最小實作修改，最後補 README 讓使用者知道新預設與覆寫方式。

**Tech Stack:** TypeScript、Bun test、OpenCode plugin API

---

## File Map

- `src/plugin/create-plugin.ts` - plugin 預設 `countdownSeconds` fallback 值
- `tests/integration/todo-continuation-enforcer.integration.test.ts` - 驗證 countdown 文案與 inject 行為
- `README.md` - 對外使用說明與預設值描述

### Task 1: 先讓預設 countdown 測試描述 10 秒行為

**Files:**
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts:132-156`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 將既有 countdown 文案測試改成 10 秒版本（先寫 failing test）**

```ts
  it("10 秒 countdown 會顯示正確 toast 文案並在完成後注入 continuation", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 10,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(10000)
    await idle

    expect(sessionApi.prompts).toHaveLength(1)
    expect(toast.messages).toEqual([
      "Resuming in 10s... (1 tasks remaining)",
      "Resuming in 9s... (1 tasks remaining)",
      "Resuming in 8s... (1 tasks remaining)",
      "Resuming in 7s... (1 tasks remaining)",
      "Resuming in 6s... (1 tasks remaining)",
      "Resuming in 5s... (1 tasks remaining)",
      "Resuming in 4s... (1 tasks remaining)",
      "Resuming in 3s... (1 tasks remaining)",
      "Resuming in 2s... (1 tasks remaining)",
      "Resuming in 1s... (1 tasks remaining)",
    ])
  })
```

- [ ] **Step 2: 跑單一整合測試確認目前行為不符合新預期**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts --test-name-pattern "10 秒 countdown"`

Expected: FAIL，因為目前 fallback/測試仍以 5 秒為主，toast 陣列不符合新預期。

- [ ] **Step 3: 補一個 plugin 預設值測試，直接鎖住未傳入 options 時的 10 秒預設**

在同一個 integration 檔案新增測試，靠 plugin 預設值而不是手動傳 `countdownSeconds`：

```ts
  it("plugin 預設 countdownSeconds 為 10 秒", async () => {
    clock = createControlledClock()
    const promptCalls: unknown[] = []
    const toastMessages: string[] = []
    const plugin = createPlugin()
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({
            data: [{ content: "finish", status: "pending", priority: "high" }],
          }),
          messages: async () => ({
            data: [
              {
                info: { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } },
                parts: [{ type: "text", text: "keep going" }],
              },
            ],
          }),
          promptAsync: async (args: unknown) => {
            promptCalls.push(args)
          },
        },
        tui: {
          showToast: async ({ body }: { body: { message: string } }) => {
            toastMessages.push(body.message)
          },
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const idle = hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "s1" },
      },
    } as never)

    await clock.advance(10000)
    await idle

    expect(promptCalls).toHaveLength(1)
    expect(toastMessages[0]).toBe("Resuming in 10s... (1 tasks remaining)")
  })
```

如果這個測試需要沿用現有 fake toast helper，就改用現有 fake adapter pattern；不要在 production code 為了測試新增額外分支。

- [ ] **Step 4: 跑剛新增的預設值測試，確認它先失敗**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts --test-name-pattern "plugin 預設 countdownSeconds 為 10 秒"`

Expected: FAIL，因為 `createPlugin()` 目前 fallback 還是 `5`。

- [ ] **Step 5: Commit 測試變更**

```bash
git add tests/integration/todo-continuation-enforcer.integration.test.ts
git commit -m "test: cover 10 second countdown default"
```

### Task 2: 以最小實作把預設值改為 10 秒

**Files:**
- Modify: `src/plugin/create-plugin.ts:11-20`
- Test: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: 修改 plugin fallback 值**

將這段：

```ts
      countdownSeconds: options?.countdownSeconds ?? 5,
```

改成：

```ts
      countdownSeconds: options?.countdownSeconds ?? 10,
```

- [ ] **Step 2: 跑兩個 countdown 相關整合測試確認通過**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts --test-name-pattern "10 秒 countdown|plugin 預設 countdownSeconds 為 10 秒"`

Expected: PASS，兩個測試都通過。

- [ ] **Step 3: 跑完整整合測試檔，確認其他顯式秒數案例不受影響**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: PASS，包含顯式傳入 `5` 秒或 `0.05` 秒的情境測試仍維持通過。

- [ ] **Step 4: Commit 實作變更**

```bash
git add src/plugin/create-plugin.ts tests/integration/todo-continuation-enforcer.integration.test.ts
git commit -m "feat: change default countdown to 10 seconds"
```

### Task 3: 同步 README 與總體驗證

**Files:**
- Modify: `README.md:21-43`
- Modify: `README.md:62-71`

- [ ] **Step 1: 在 Usage 區塊補上預設 10 秒說明**

在 `## Usage` 下方加入：

```md
By default, the plugin waits 10 seconds before injecting a continuation prompt when a session becomes idle.

If you are wiring the plugin programmatically, you can override this with `countdownSeconds`:

```ts
createPlugin({ countdownSeconds: 3 })
```
```

- [ ] **Step 2: 若 verification checklist 有文字暗示舊預設值，一併改成中性描述**

保持 checklist 驗證的是「會 inject」與「question 時不 inject」，不要新增與預設秒數矛盾的描述。若無舊文案，則只保留 Usage 更新。

- [ ] **Step 3: 跑型別檢查與全量測試**

Run: `bun run typecheck && bun test`

Expected: PASS，無 type error，所有測試通過。

- [ ] **Step 4: 跑 build 確認發佈產物仍可生成**

Run: `bun run build`

Expected: PASS，輸出 `dist/index.js` 與宣告檔。

- [ ] **Step 5: Commit 文件更新與驗證後狀態**

```bash
git add README.md
git commit -m "docs: document 10 second countdown default"
```

## Self-Review

- Spec coverage: 已覆蓋 fallback 值更新、測試同步、README 說明與驗證。
- Placeholder scan: 無 `TBD`、`TODO`、模糊的「之後補上」描述。
- Type consistency: 所有步驟都使用既有 `createPlugin({ countdownSeconds?: number })` 與整合測試檔路徑；未引入新 API 名稱。
