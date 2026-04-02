import { describe, expect, it } from "bun:test"
import { createSystemDirective } from "../../src/shared/system-directive"
import { CONTINUATION_PROMPT, HOOK_NAME } from "../../src/todo-continuation-enforcer/constants"

describe("continuation constants", () => {
  it("使用 createSystemDirective 組裝 continuation prompt", () => {
    expect(HOOK_NAME).toBe("todo-continuation-enforcer")
    expect(createSystemDirective("TODO_CONTINUATION")).toBe("[TODO_CONTINUATION]")
    expect(CONTINUATION_PROMPT).toBe(
      `[TODO_CONTINUATION]\nIf you need a user response, use the Question tool instead of asking in plain text.\n\nElse incomplete tasks remain in your todo list. Continue working on the next pending task.\n- Proceed without asking for permission\n- Mark each task complete when finished\n- Do not stop until all tasks are done\n- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.`,
    )
  })
})
