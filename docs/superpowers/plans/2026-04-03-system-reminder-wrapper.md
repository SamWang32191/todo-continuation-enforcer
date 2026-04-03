# System Reminder Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the final injected continuation prompt in `<system-reminder>...</system-reminder>` while preserving the existing internal `[TODO_CONTINUATION]` content and todo rendering.

**Architecture:** Keep `CONTINUATION_PROMPT` unchanged and add the XML-style wrapper at the injection boundary in `continuation-injection.ts`. Protect the behavior with exact-output unit coverage and a lightweight integration assertion that checks the idle flow still injects the wrapped prompt.

**Tech Stack:** TypeScript, Bun test runner, existing todo continuation enforcer test helpers

---

## File Map

- Modify: `src/todo-continuation-enforcer/continuation-injection.ts`
  - Responsibility: compose the final prompt sent to `sessionApi.injectPrompt()`
- Modify: `tests/unit/continuation-injection.test.ts`
  - Responsibility: exact-output and formatting assertions for wrapped continuation prompt
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
  - Responsibility: ensure idle-flow injection still includes the wrapped prompt boundary

### Task 1: Add failing exact-output test for wrapper

**Files:**
- Modify: `tests/unit/continuation-injection.test.ts`
- Read for reference: `src/todo-continuation-enforcer/continuation-injection.ts`

- [ ] **Step 1: Write the failing unit test**

Add or update the exact-output assertion so it expects the wrapper around the entire injected prompt:

```ts
it("injectContinuation 會用 system-reminder 包住完整 continuation prompt", async () => {
  let prompt = ""

  const sessionApi: SessionApi = {
    async getTodos() {
      return [] satisfies Todo[]
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
    `<system-reminder>\n${CONTINUATION_PROMPT}\n\nRemaining todos:\n- [pending] finish docs\n</system-reminder>`,
  )
})
```

- [ ] **Step 2: Run the unit test to verify RED**

Run: `bun test tests/unit/continuation-injection.test.ts`

Expected: FAIL because the current implementation still injects `${CONTINUATION_PROMPT}\n\nRemaining todos:...` without the wrapper.

- [ ] **Step 3: Write the minimal implementation**

Update prompt composition in `src/todo-continuation-enforcer/continuation-injection.ts`:

```ts
const promptBody = `${CONTINUATION_PROMPT}\n\n${remainingTodosSection}`
const prompt = `<system-reminder>\n${promptBody}\n</system-reminder>`
```

Keep `formatRemainingTodos()` and todo filtering unchanged.

- [ ] **Step 4: Re-run the unit test to verify GREEN**

Run: `bun test tests/unit/continuation-injection.test.ts`

Expected: PASS for the exact-output test and existing spacing/list-format tests.

- [ ] **Step 5: Refactor only if needed**

If the file becomes clearer with a tiny helper constant, keep it minimal and local:

```ts
const SYSTEM_REMINDER_OPEN = "<system-reminder>"
const SYSTEM_REMINDER_CLOSE = "</system-reminder>"
```

Do not extract a shared helper unless another call site actually needs it.

### Task 2: Add integration coverage for wrapped injection

**Files:**
- Modify: `tests/integration/todo-continuation-enforcer.integration.test.ts`
- Read for reference: `src/todo-continuation-enforcer/constants.ts`

- [ ] **Step 1: Tighten the existing idle-flow assertion**

Update the integration test `idle 且有 incomplete todo 時會注入 continuation` to assert wrapper boundaries without duplicating the entire prompt text:

```ts
expect(sessionApi.prompts).toHaveLength(1)
expect(sessionApi.prompts[0]).toContain("<system-reminder>\n")
expect(sessionApi.prompts[0]).toContain(CONTINUATION_PROMPT)
expect(sessionApi.prompts[0]).toContain("Remaining todos:")
expect(sessionApi.prompts[0]).toEndWith("\n</system-reminder>")
```

- [ ] **Step 2: Run the integration test to verify RED/GREEN as appropriate**

Run: `bun test tests/integration/todo-continuation-enforcer.integration.test.ts --test-name-pattern "idle 且有 incomplete todo 時會注入 continuation"`

Expected before implementation: FAIL on missing wrapper assertions.

Expected after Task 1 implementation: PASS.

- [ ] **Step 3: Re-run both touched test files together**

Run: `bun test tests/unit/continuation-injection.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: PASS with no new failures in touched prompt-related tests.

### Task 3: Final diagnostics and completion check

**Files:**
- Check: `src/todo-continuation-enforcer/continuation-injection.ts`
- Check: `tests/unit/continuation-injection.test.ts`
- Check: `tests/integration/todo-continuation-enforcer.integration.test.ts`

- [ ] **Step 1: Run language diagnostics on changed files**

Run language-server diagnostics for:

- `src/todo-continuation-enforcer/continuation-injection.ts`
- `tests/unit/continuation-injection.test.ts`
- `tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: no errors.

- [ ] **Step 2: Run the focused verification command**

Run: `bun test tests/unit/continuation-injection.test.ts tests/integration/todo-continuation-enforcer.integration.test.ts`

Expected: PASS.

- [ ] **Step 3: Capture any reusable lesson if the work reveals one**

If verification exposes a reusable prompt-formatting/testing rule, update `docs/lessons/` before closing the task.

## Self-Review

- Spec coverage: wrapper boundary, preserved internal directive, exact-output testing, and integration confirmation are each covered by Tasks 1-3.
- Placeholder scan: no TBD/TODO placeholders remain; every command and file path is explicit.
- Type consistency: plan uses the existing `injectContinuation`, `CONTINUATION_PROMPT`, `SessionApi`, and `Todo` names from the repo.
