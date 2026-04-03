type EventInput = {
  event: {
    type: string
    properties?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getDeletedSessionID(event: EventInput["event"]): string | undefined {
  if (event.type !== "session.deleted") {
    return undefined
  }

  const properties = isRecord(event.properties) ? event.properties : undefined

  return isRecord(properties?.info) && typeof properties.info.id === "string"
    ? properties.info.id
    : undefined
}

export function createStopContinuationGuard() {
  const stopped = new Set<string>()

  return {
    stop(sessionID: string) {
      stopped.add(sessionID)
    },
    isStopped(sessionID: string) {
      return stopped.has(sessionID)
    },
    clear(sessionID: string) {
      stopped.delete(sessionID)
    },
    async event(input: EventInput) {
      const sessionID = getDeletedSessionID(input.event)

      if (sessionID) {
        stopped.delete(sessionID)
      }
    },
  }
}
