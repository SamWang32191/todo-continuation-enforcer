import { describe, expect, it } from "bun:test"

import { injectContinuation } from "../../src/todo-continuation-enforcer/continuation-injection"
import type { SessionApi } from "../../src/plugin/adapters/session-api"

describe("injectContinuation", () => {
  it("remaining todos 會包含 in_progress 且排除 completed", async () => {
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
      todos: [
        { content: "pending", status: "pending", priority: "normal" },
        { content: "progress", status: "in_progress", priority: "normal" },
        { content: "done", status: "completed", priority: "normal" },
      ],
    })

    expect(prompt).toContain("[pending] pending")
    expect(prompt).toContain("[in_progress] progress")
    expect(prompt).not.toContain("[completed] done")
  })
})
