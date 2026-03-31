import { describe, expect, it } from "bun:test"

import { shouldContinueOnIdle } from "../../src/todo-continuation-enforcer/idle-event"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"

describe("shouldContinueOnIdle", () => {
  const baseState = (): SessionState => ({
    stagnationCount: 0,
    consecutiveFailures: 0,
  })

  it("允許通過所有 gate", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: baseState(),
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(true)
  })

  it("pending question 會阻擋", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: baseState(),
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: true,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("pending_question")
  })

  it("cooldown 會阻擋", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: { ...baseState(), lastInjectedAt: 9_500 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("cooldown")
  })

  it("recent abort 會阻擋", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: { ...baseState(), abortDetectedAt: 9_500 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("recent_abort")
  })

  it("skip agent 會阻擋", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: baseState(),
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "plan",
      skipAgents: ["plan"],
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("skip_agent")
  })

  it("compaction guard 會阻擋", async () => {
    const result = await shouldContinueOnIdle({
      sessionID: "s1",
      state: { ...baseState(), recentCompactionAt: 9_500 },
      todos: [{ content: "finish", status: "pending", priority: "high" }],
      now: 10_000,
      hasPendingQuestion: false,
      hasRunningBackgroundTask: false,
      isContinuationStopped: false,
      agent: "sisyphus",
    })

    expect(result.shouldInject).toBe(false)
    expect(result.reason).toBe("compaction_guard")
  })
})
