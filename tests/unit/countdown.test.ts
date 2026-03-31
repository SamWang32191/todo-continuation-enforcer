import { afterEach, describe, expect, it } from "bun:test"

import { runCountdown } from "../../src/todo-continuation-enforcer/countdown"
import type { CountdownToast } from "../../src/plugin/adapters/toast"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"
import { createControlledClock } from "../helpers/controlled-clock"

function createState(): SessionState {
  return {
    stagnationCount: 0,
    consecutiveFailures: 0,
  }
}

function createToastRecorder() {
  const updates: string[] = []

  const toast: CountdownToast = {
    async showCountdown(message) {
      updates.push(message)
    },
  }

  return { toast, updates }
}

describe("runCountdown", () => {
  let clock: ReturnType<typeof createControlledClock> | undefined

  afterEach(() => {
    clock?.restore()
    clock = undefined
  })

  it("會顯示 countdown toast、每秒更新並在結束後關閉", async () => {
    clock = createControlledClock()
    const state = createState()
    const { toast, updates } = createToastRecorder()

    const resultPromise = runCountdown({ seconds: 2, incompleteCount: 3, state, toast })

    await clock.advance(2000)
    const result = await resultPromise

    expect(result).toBe(true)
    expect(updates[0]).toContain("Resuming in 2s... (3 tasks remaining)")
    expect(updates.some((message) => message.includes("Resuming in 1s... (3 tasks remaining)"))).toBe(true)
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
    expect(state.countdownCancel).toBeUndefined()
  })

  it("可以在 countdown 中取消並清理 timers", async () => {
    clock = createControlledClock()
    const state = createState()
    const { toast } = createToastRecorder()

    const promise = runCountdown({ seconds: 5, incompleteCount: 1, state, toast })

    await clock.advance(1100)
    state.countdownCancel?.()

    await expect(promise).resolves.toBe(false)
    expect(state.countdownTimer).toBeUndefined()
    expect(state.countdownInterval).toBeUndefined()
    expect(state.countdownCancel).toBeUndefined()
  })
})
