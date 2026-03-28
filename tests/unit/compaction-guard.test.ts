import { describe, expect, it } from "bun:test"
import { isCompactionGuardActive } from "../../src/todo-continuation-enforcer/compaction-guard"
import type { SessionState } from "../../src/todo-continuation-enforcer/types"

describe("isCompactionGuardActive", () => {
  it("在 guard window 內視為 active", () => {
    const activeState: SessionState = {
      recentCompactionAt: 1000,
      stagnationCount: 0,
      consecutiveFailures: 0,
    }

    expect(isCompactionGuardActive(activeState, 1500)).toBe(true)
    expect(isCompactionGuardActive(activeState, 61_001)).toBe(false)
  })
})
