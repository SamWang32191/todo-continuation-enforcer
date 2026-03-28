import type { SessionState } from "./types"

export async function runCountdown(seconds: number, state?: SessionState): Promise<boolean> {
  if (seconds <= 0) {
    return true
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false

    const cleanup = (): void => {
      if (state?.countdownTimer) {
        clearTimeout(state.countdownTimer)
        state.countdownTimer = undefined
      }

      if (state?.countdownCancel === cancel) {
        state.countdownCancel = undefined
      }
    }

    const complete = (value: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(value)
    }

    const timer = setTimeout(() => complete(true), seconds * 1000)

    const cancel = () => complete(false)

    if (state) {
      state.countdownTimer = timer
      state.countdownCancel = cancel
    }
  })
}
