import type { SessionState } from "./types"

export class SessionStateStore {
  private readonly states = new Map<string, SessionState>()

  getState(sessionId: string): SessionState {
    const existing = this.states.get(sessionId)

    if (existing) {
      return existing
    }

    const state = this.createState(sessionId)
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

  private createState(sessionId: string): SessionState {
    return {
      countdownStartedAt: Date.now(),
      lastIncompleteCount: 0,
      lastInjectedAt: undefined,
      awaitingPostInjectionProgressCheck: false,
      inFlight: false,
      countdownCancel: undefined,
      stagnationCount: 0,
      consecutiveFailures: 0,
      recentCompactionAt: undefined,
      recentCompactionEpoch: undefined,
      acknowledgedCompactionEpoch: undefined,
    }
  }

  private disposeState(state: SessionState | undefined): void {
    if (!state) {
      return
    }

    if (state.countdownTimer) {
      clearTimeout(state.countdownTimer)
      state.countdownTimer = undefined
    }

    if (state.countdownCancel) {
      state.countdownCancel()
      state.countdownCancel = undefined
    }

    if (state.countdownInterval) {
      clearInterval(state.countdownInterval)
      state.countdownInterval = undefined
    }
  }
}
