export interface BackgroundTaskProbe {
  hasRunningTask(sessionID: string): boolean
}

export function createNoopBackgroundTaskProbe(): BackgroundTaskProbe {
  return {
    hasRunningTask() {
      return false
    },
  }
}
