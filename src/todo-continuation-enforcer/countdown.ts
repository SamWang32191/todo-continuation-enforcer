import type { SessionState } from "./types"
import type { CountdownToast } from "../plugin/adapters/toast"

function formatCountdownMessage(seconds: number, incompleteCount: number): string {
  return `Resuming in ${seconds}s... (${incompleteCount} tasks remaining)`
}

function clearCountdownState(state?: SessionState): void {
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

  if (state.countdownCancel) {
    state.countdownCancel = undefined
  }
}

export async function runCountdown(args: {
  seconds: number
  incompleteCount: number
  state?: SessionState
  toast?: CountdownToast
}): Promise<boolean> {
  if (args.seconds <= 0) {
    return true
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false
    let remaining = args.seconds

    const cleanup = (): void => {
      clearCountdownState(args.state)
    }

    const complete = (value: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(value)
    }

    const cancel = () => complete(false)

    const updateToast = async (): Promise<void> => {
      await args.toast?.showCountdown(formatCountdownMessage(remaining, args.incompleteCount))
    }

    const timer = setTimeout(() => complete(true), args.seconds * 1000)

    const interval = setInterval(() => {
      remaining -= 1

      if (remaining <= 0) {
        complete(true)
        return
      }

      updateToast()
    }, 1000)

    if (args.state) {
      args.state.countdownTimer = timer
      args.state.countdownInterval = interval
      args.state.countdownCancel = cancel
    }

    void updateToast()
  })
}
