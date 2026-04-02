# Prompt String Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重構 continuation prompt 的 TypeScript 字串組裝方式，提升原始碼可讀性，同時保持 inject 出去的 prompt 內容完全不變。

**Architecture:** 這次是純重構，不改變 prompt 文案與注入流程。`constants.ts` 改用段落陣列組裝 `CONTINUATION_PROMPT`，`continuation-injection.ts` 改用區塊化組裝最終 prompt，讓程式碼直接表達段落結構而不是依賴大量 `\n\n`。

**Tech Stack:** TypeScript, Bun test, existing repo prompt constants

---

## File Structure

- Modify: `src/todo-continuation-enforcer/constants.ts`
  - Responsibility: 定義 `CONTINUATION_PROMPT`，改成可讀性較高的分段組裝。
- Modify: `src/todo-continuation-enforcer/continuation-injection.ts`
  - Responsibility: 組出 inject 用的最終 prompt，改成明確區塊化組裝。
- Verify: `tests/unit/constants.test.ts`
  - Responsibility: 確保 `CONTINUATION_PROMPT` 文字完全不變。
- Verify: `tests/unit/continuation-injection.test.ts`
  - Responsibility: 確保 inject 後 prompt 仍包含相同段落與 remaining todos。

### Task 1: Refactor `CONTINUATION_PROMPT` assembly

**Files:**
- Modify: `src/todo-continuation-enforcer/constants.ts`
- Test: `tests/unit/constants.test.ts`

- [ ] **Step 1: Write the failing test expectation as a named constant in `tests/unit/constants.test.ts`**

```ts
import { describe, expect, it } from "bun:test"
import { createSystemDirective } from "../../src/shared/system-directive"
import { CONTINUATION_PROMPT, HOOK_NAME } from "../../src/todo-continuation-enforcer/constants"

const EXPECTED_CONTINUATION_PROMPT =
  `[TODO_CONTINUATION]\nIf you need a user response or confirmation, use the QUESTION TOOL ask again instead of asking in plain text.\n\nElse incomplete tasks remain in your todo list. Continue working on the next pending task.\n- Proceed without asking for permission\n- Mark each task complete when finished\n- Do not stop until all tasks are done\n- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.`

describe("continuation constants", () => {
  it("使用 createSystemDirective 組裝 continuation prompt", () => {
    expect(HOOK_NAME).toBe("todo-continuation-enforcer")
    expect(createSystemDirective("TODO_CONTINUATION")).toBe("[TODO_CONTINUATION]")
    expect(CONTINUATION_PROMPT).toBe(EXPECTED_CONTINUATION_PROMPT)
  })
})
```

- [ ] **Step 2: Run the targeted test to verify the current behavior is captured**

Run: `bun test tests/unit/constants.test.ts`

Expected output:

```text
bun test v1.x.x
tests/unit/constants.test.ts:
(pass) continuation constants > 使用 createSystemDirective 組裝 continuation prompt
```

- [ ] **Step 3: Refactor `src/todo-continuation-enforcer/constants.ts` to use paragraph arrays**

```ts
import { createSystemDirective } from "../shared/system-directive"

export const HOOK_NAME = "todo-continuation-enforcer"
export const DEFAULT_SKIP_AGENTS = ["prometheus", "compaction", "plan"]
export const COUNTDOWN_SECONDS = 5
export const TOAST_DURATION_MS = 900
export const ABORT_WINDOW_MS = 3_000
export const COMPACTION_GUARD_MS = 60_000
export const CONTINUATION_COOLDOWN_MS = 5_000
export const MAX_STAGNATION_COUNT = 3
export const MAX_CONSECUTIVE_FAILURES = 5
export const FAILURE_RESET_WINDOW_MS = 5 * 60_000

const CONTINUATION_INSTRUCTION_LINES = [
  "Else incomplete tasks remain in your todo list. Continue working on the next pending task.",
  "- Proceed without asking for permission",
  "- Mark each task complete when finished",
  "- Do not stop until all tasks are done",
  "- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.",
]

export const CONTINUATION_PROMPT = [
  createSystemDirective("TODO_CONTINUATION"),
  "If you need a user response or confirmation, use the QUESTION TOOL ask again instead of asking in plain text.",
  CONTINUATION_INSTRUCTION_LINES.join("\n"),
].join("\n\n")
```

- [ ] **Step 4: Re-run the targeted constants test**

Run: `bun test tests/unit/constants.test.ts`

Expected output:

```text
bun test v1.x.x
tests/unit/constants.test.ts:
(pass) continuation constants > 使用 createSystemDirective 組裝 continuation prompt
```

- [ ] **Step 5: Commit the constants refactor**

```bash
git add tests/unit/constants.test.ts src/todo-continuation-enforcer/constants.ts
git commit -m "refactor: improve continuation prompt readability"
```

### Task 2: Refactor final prompt assembly in `injectContinuation`

**Files:**
- Modify: `src/todo-continuation-enforcer/continuation-injection.ts`
- Test: `tests/unit/continuation-injection.test.ts`

- [ ] **Step 1: Add an exact final prompt assertion to `tests/unit/continuation-injection.test.ts`**

```ts
it("injectContinuation 會組出完整 prompt 結構", async () => {
  let prompt = ""

  const sessionApi: SessionApi = {
    async getTodos() {
      return []
    },
    async getLatestMessageInfo() {
      return undefined
    },
    async injectPrompt(_sessionID, nextPrompt) {
      prompt = nextPrompt
    },
  }

  await injectContinuation({
    sessionID: "s1",
    sessionApi,
    todos: [{ content: "finish docs", status: "pending", priority: "high" }],
  })

  expect(prompt).toBe(
    `${CONTINUATION_PROMPT}\n\nRemaining todos:\n- [pending] finish docs`,
  )
})
```

- [ ] **Step 2: Run the targeted injection tests before refactoring**

Run: `bun test tests/unit/continuation-injection.test.ts`

Expected output:

```text
bun test v1.x.x
tests/unit/continuation-injection.test.ts:
(pass) injectContinuation > remaining todos 會包含 in_progress 且排除 completed
(pass) injectContinuation > countdown 完成後 fresh recheck 通過時才會 inject continuation
(pass) injectContinuation > injectContinuation 會組出 TODO_CONTINUATION 與 remaining todos
(pass) injectContinuation > injectContinuation 會組出完整 prompt 結構
```

- [ ] **Step 3: Refactor `src/todo-continuation-enforcer/continuation-injection.ts` to assemble named sections**

```ts
import type { SessionApi } from "../plugin/adapters/session-api"

import { CONTINUATION_PROMPT } from "./constants"
import { isIncomplete } from "./todo"
import type { Todo } from "./types"

function formatRemainingTodos(todos: readonly Todo[]): string {
  return todos
    .filter(isIncomplete)
    .map((todo) => `- [${todo.status}] ${todo.content}`)
    .join("\n")
}

export async function injectContinuation(args: {
  sessionID: string
  sessionApi: SessionApi
  todos: Todo[]
  agent?: string
  model?: { providerID: string; modelID: string }
}): Promise<void> {
  const remainingTodos = formatRemainingTodos(args.todos)
  const promptSections = [
    CONTINUATION_PROMPT,
    ["Remaining todos:", remainingTodos].join("\n"),
  ]
  const prompt = promptSections.join("\n\n")

  await args.sessionApi.injectPrompt(args.sessionID, prompt, {
    agent: args.agent,
    model: args.model,
  })
}
```

- [ ] **Step 4: Run the targeted injection tests after refactoring**

Run: `bun test tests/unit/continuation-injection.test.ts`

Expected output:

```text
bun test v1.x.x
tests/unit/continuation-injection.test.ts:
(pass) injectContinuation > remaining todos 會包含 in_progress 且排除 completed
(pass) injectContinuation > countdown 完成後 fresh recheck 通過時才會 inject continuation
(pass) injectContinuation > injectContinuation 會組出 TODO_CONTINUATION 與 remaining todos
(pass) injectContinuation > injectContinuation 會組出完整 prompt 結構
```

- [ ] **Step 5: Run the full verification commands**

Run: `bun test && bun run typecheck`

Expected output:

```text
bun test v1.x.x
...
<all tests pass>

$ tsc -p tsconfig.typecheck.json
<no output>
```

- [ ] **Step 6: Commit the injection refactor and verification updates**

```bash
git add src/todo-continuation-enforcer/continuation-injection.ts tests/unit/continuation-injection.test.ts
git commit -m "refactor: clarify continuation prompt assembly"
```

## Self-Review

- **Spec coverage:**
  - `CONTINUATION_PROMPT` 可讀性改善 → Task 1
  - `injectContinuation()` 區塊化組裝 → Task 2
  - prompt 內容不變 → Task 1 Step 2/4、Task 2 Step 1/2/4/5
- **Placeholder scan:** 無 `TBD`、`TODO`、模糊步驟或缺少命令。
- **Type consistency:** 沿用現有 `CONTINUATION_PROMPT`、`SessionApi`、`Todo`、`injectContinuation` 名稱，沒有引入新型別或未定義 API。
