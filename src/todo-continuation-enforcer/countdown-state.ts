import type { SessionState } from "./types"

export function clearCountdownResources(state?: SessionState): void {
  if (!state) {
    return
  }

  if (state.countdownTimer) {
    clearTimeout(state.countdownTimer)
    state.countdownTimer = undefined
  }

  if (state.countdownInterval) {
    clearInterval(state.countdownInterval)
    state.countdownInterval = undefined
  }

  state.countdownCancel = undefined
}

export function cancelCountdownState(state?: SessionState): void {
  if (!state) {
    return
  }

  state.countdownCancel?.()
  clearCountdownResources(state)
  state.pendingContinuation = false
}
