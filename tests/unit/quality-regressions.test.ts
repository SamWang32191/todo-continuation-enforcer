import { describe, expect, it } from "bun:test"

import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
import { hasPendingQuestion } from "../../src/todo-continuation-enforcer/pending-question-detection"
import { resolveMessageInfo } from "../../src/todo-continuation-enforcer/resolve-message-info"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"
import { shouldContinueOnIdle } from "../../src/todo-continuation-enforcer/idle-event"
import { createFakeBackgroundTaskProbe, createFakeLogger, createFakeSessionApi } from "../helpers/fakes"

describe("quality regressions", () => {
  it("idle decision 會阻擋 inFlight 重入", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: { stagnationCount: 0, consecutiveFailures: 0, inFlight: true } satisfies SessionState,
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("in_flight")
  })

  it("assistant 文字中間的問號不算 pending question", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        text: "Use ? as a wildcard in regex",
      }),
    ).toBe(false)
  })

  it("resolveMessageInfo 會在 sessionApi 沒資料時回退 messageStore", async () => {
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined })
    const result = await resolveMessageInfo({
      sessionID: "s1",
      sessionApi,
      messageStore: {
        async findLatestMessageInfo() {
          return { role: "assistant", text: "fallback", agent: "sisyphus" }
        },
      },
    })

    expect(result?.text).toBe("fallback")
  })

  it("inject 失敗不會增加 stagnation state", async () => {
    const sessionApi = createFakeSessionApi()
    sessionApi.injectPrompt = async () => {
      throw new Error("boom")
    }

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    const state = enforcer.getState("s1")
    expect(state?.stagnationCount ?? 0).toBe(0)
  })
})
