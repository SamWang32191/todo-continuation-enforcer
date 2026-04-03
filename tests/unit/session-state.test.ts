import { afterEach, describe, expect, it } from "bun:test"
import { SessionStateStore } from "../../src/todo-continuation-enforcer/session-state"
import { runCountdown } from "../../src/todo-continuation-enforcer/countdown"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"
import { createControlledClock } from "../helpers/controlled-clock"

describe("SessionStateStore", () => {
  let clock: ReturnType<typeof createControlledClock> | undefined

  afterEach(() => {
    clock?.restore()
    clock = undefined
  })

  it("提供最小狀態欄位並清除 timers", () => {
    const store = new SessionStateStore()
    const state = store.getState("session-1")

    const typedState: SessionState = state
    expect(typedState.stagnationCount).toBe(0)
    expect(typedState.consecutiveFailures).toBe(0)

    expect(state.lastIncompleteCount).toBe(0)
    expect(state.inFlight).toBe(false)

    state.countdownTimer = setTimeout(() => {}, 1000)
    state.countdownInterval = setInterval(() => {}, 1000)

    store.clear("session-1")

    expect(store.getExistingState("session-1")).toBeUndefined()
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
  })

  it("清除進行中的 countdown 會終止 promise 並收斂 pendingContinuation", async () => {
    clock = createControlledClock()
    const store = new SessionStateStore()
    const state = store.getState("session-1")
    state.pendingContinuation = true

    const promise = runCountdown({ seconds: 5, incompleteCount: 1, state })

    await clock.advance(1100)
    store.clear("session-1")

    await expect(promise).resolves.toBe(false)
    expect(state.pendingContinuation).toBe(false)
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
    expect(state.countdownCancel).toBeUndefined()
  })
})
