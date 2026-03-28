import { describe, expect, it } from "bun:test"
import { SessionStateStore } from "../../src/todo-continuation-enforcer/session-state"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"

describe("SessionStateStore", () => {
  it("提供最小狀態欄位並清除 timers", () => {
    const store = new SessionStateStore()
    const state = store.getState("session-1")

    const typedState: SessionState = state
    expect(typedState.stagnationCount).toBe(0)
    expect(typedState.consecutiveFailures).toBe(0)

    expect(state.lastIncompleteCount).toBe(0)
    expect(state.awaitingPostInjectionProgressCheck).toBe(false)
    expect(state.inFlight).toBe(false)

    state.countdownTimer = setTimeout(() => {}, 1000)
    state.countdownInterval = setInterval(() => {}, 1000)

    store.clear("session-1")

    expect(store.getExistingState("session-1")).toBeUndefined()
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
  })
})
