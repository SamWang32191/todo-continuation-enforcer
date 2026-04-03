import type { SessionState } from "./types"
import { cancelCountdownState } from "./countdown-state"

export class SessionStateStore {
  private readonly states = new Map<string, SessionState>()

  getState(sessionId: string): SessionState {
    const existing = this.states.get(sessionId)

    if (existing) {
      return existing
    }

    const state = this.createState()
    this.states.set(sessionId, state)
    return state
  }

  getExistingState(sessionId: string): SessionState | undefined {
    return this.states.get(sessionId)
  }

  clear(sessionId: string): void {
    this.disposeState(this.states.get(sessionId))
    this.states.delete(sessionId)
  }

  private createState(): SessionState {
    return {
      lastIncompleteCount: 0,
      lastInjectedAt: undefined,
      inFlight: false,
      countdownCancel: undefined,
      pendingContinuation: false,
      stagnationCount: 0,
      consecutiveFailures: 0,
      recentCompactionAt: undefined,
    }
  }

  private disposeState(state: SessionState | undefined): void {
    if (!state) {
      return
    }

    cancelCountdownState(state)
    state.pendingContinuation = false
  }
}
