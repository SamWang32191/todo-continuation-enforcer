import { describe, expect, it } from "bun:test"

import { CONTINUATION_PROMPT } from "../../src/todo-continuation-enforcer/constants"
import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
import { injectContinuation } from "../../src/todo-continuation-enforcer/continuation-injection"
import { createFakeBackgroundTaskProbe, createFakeLogger } from "../helpers/fakes"
import type { MessageInfo, SessionApi } from "../../src/plugin/adapters/session-api"
import type { Todo } from "../../src/todo-continuation-enforcer/types"

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

  it("countdown 完成後 fresh recheck 通過時才會 inject continuation", async () => {
    let getTodosCalls = 0
    let getLatestMessageInfoCalls = 0
    let injectCalls = 0

    const sessionApi = {
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

  it("injectContinuation 會組出 TODO_CONTINUATION 與 remaining todos", async () => {
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

    expect(prompt).toBe(`${CONTINUATION_PROMPT}\n\nRemaining todos:\n- [pending] finish docs`)
  })

  it("多筆 remaining todos 之間會用單一換行分隔", async () => {
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
      todos: [
        { content: "first", status: "pending", priority: "normal" },
        { content: "second", status: "in_progress", priority: "normal" },
      ],
    })

    expect(prompt).toContain("Remaining todos:\n- [pending] first\n- [in_progress] second")
    expect(prompt).not.toContain("Remaining todos:\n- [pending] first\n\n- [in_progress] second")
  })
})
