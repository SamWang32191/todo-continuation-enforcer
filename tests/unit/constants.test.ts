import { describe, expect, it } from "bun:test"
import { createSystemDirective } from "../../src/shared/system-directive"
import { CONTINUATION_PROMPT, HOOK_NAME } from "../../src/todo-continuation-enforcer/constants"

const EXPECTED_CONTINUATION_DIRECTIVE = createSystemDirective("TODO_CONTINUATION")
const EXPECTED_CONTINUATION_PROMPT = `${EXPECTED_CONTINUATION_DIRECTIVE}
If you need a user response or confirmation, use the QUESTION TOOL ask again instead of asking in plain text.

Else incomplete tasks remain in your todo list. Continue working on the next pending task.
- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done
- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.`

describe("continuation constants", () => {
  it("使用 createSystemDirective 組裝 continuation prompt", () => {
    expect(HOOK_NAME).toBe("todo-continuation-enforcer")
    expect(EXPECTED_CONTINUATION_DIRECTIVE).toBe("[TODO_CONTINUATION]")
    expect(CONTINUATION_PROMPT).toBe(EXPECTED_CONTINUATION_PROMPT)
  })
})
