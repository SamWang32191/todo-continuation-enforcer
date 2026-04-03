import { describe, expect, it } from "bun:test"

import { CONTINUATION_PROMPT } from "../../src/todo-continuation-enforcer/constants"
import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
import { injectContinuation } from "../../src/todo-continuation-enforcer/continuation-injection"
import { createFakeBackgroundTaskProbe, createFakeLogger, createFakeSessionApi } from "../helpers/fakes"
import type { MessageInfo } from "../../src/plugin/adapters/session-api"
import type { Todo } from "../../src/todo-continuation-enforcer/types"

describe("injectContinuation", () => {
  it("injectContinuation 會用 system-reminder 包住完整 continuation prompt", async () => {
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined, todos: [] })

    await injectContinuation({
      sessionID: "s1",
      sessionApi,
      todos: [{ content: "finish docs", status: "pending", priority: "high" }],
    })

    expect(sessionApi.prompts[0]).toBe(
      `<system-reminder>\n${CONTINUATION_PROMPT}\n\nRemaining todos:\n- [pending] finish docs\n</system-reminder>`,
    )
  })

  it("remaining todos 會包含 in_progress 且排除 completed", async () => {
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined, todos: [] })

    await injectContinuation({
      sessionID: "s1",
      sessionApi,
      todos: [
        { content: "pending", status: "pending", priority: "normal" },
        { content: "progress", status: "in_progress", priority: "normal" },
        { content: "done", status: "completed", priority: "normal" },
      ],
    })

    expect(sessionApi.prompts[0]).toContain("[pending] pending")
    expect(sessionApi.prompts[0]).toContain("[in_progress] progress")
    expect(sessionApi.prompts[0]).not.toContain("[completed] done")
  })

  it("countdown 完成後 fresh recheck 通過時才會 inject continuation", async () => {
    let getTodosCalls = 0
    let getLatestMessageInfoCalls = 0
    let injectCalls = 0

    const sessionApi = {
      async abort() {},
      async getTodos() {
        getTodosCalls += 1
        return [{ content: "finish", status: "pending", priority: "high" }] satisfies Todo[]
      },
      async getLatestMessageInfo() {
        getLatestMessageInfoCalls += 1
        return { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } } satisfies MessageInfo
      },
      async injectPrompt() {
        injectCalls += 1
      },
    }

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.01,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(getTodosCalls).toBe(2)
    expect(getLatestMessageInfoCalls).toBe(2)
    expect(injectCalls).toBe(1)
  })

  it("多筆 remaining todos 之間會用單一換行分隔", async () => {
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined, todos: [] })

    await injectContinuation({
      sessionID: "s1",
      sessionApi,
      todos: [
        { content: "first", status: "pending", priority: "normal" },
        { content: "second", status: "in_progress", priority: "normal" },
      ],
    })

    expect(sessionApi.prompts[0]).toContain("Remaining todos:\n- [pending] first\n- [in_progress] second")
    expect(sessionApi.prompts[0]).not.toContain("Remaining todos:\n- [pending] first\n\n- [in_progress] second")
  })
})
