import type { Hooks } from "@opencode-ai/plugin"

import type { ContinuationEvent } from "../todo-continuation-enforcer/handler"

type ContinuationEventType = ContinuationEvent["type"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isContinuationEventType(type: unknown): type is ContinuationEventType {
  return type === "session.idle" || type === "session.error" || type === "session.deleted" || type === "session.compacted"
}

function getSessionID(event: unknown): string | undefined {
  if (!isRecord(event) || !isContinuationEventType(event.type)) {
    return undefined
  }

  const properties = isRecord(event.properties) ? event.properties : undefined

  switch (event.type) {
    case "session.idle":
    case "session.error":
    case "session.compacted":
      if (typeof properties?.sessionID === "string") {
        return properties.sessionID
      }

      return isRecord(properties?.info) && typeof properties.info.id === "string" ? properties.info.id : undefined
    case "session.deleted":
      return isRecord(properties?.info) && typeof properties.info.id === "string"
        ? properties.info.id
        : undefined
    default:
      return undefined
  }
}

function getContinuationError(event: unknown): { name?: string } | undefined {
  if (!isRecord(event) || event.type !== "session.error") {
    return undefined
  }

  const properties = isRecord(event.properties) ? event.properties : undefined
  const error = isRecord(properties?.error)
    ? properties.error
    : isRecord(properties?.info) && isRecord(properties.info.error)
      ? properties.info.error
      : undefined

  if (!isRecord(error)) {
    return undefined
  }

  return {
    name: typeof error.name === "string" ? error.name : undefined,
  }
}

export function createEventHandler(handleEvent: (event: ContinuationEvent) => Promise<void>): NonNullable<Hooks["event"]> {
  return async ({ event }) => {
    if (!isRecord(event) || !isContinuationEventType(event.type)) {
      return
    }

    const sessionID = getSessionID(event)

    if (!sessionID) {
      return
    }

    await handleEvent({
      type: event.type,
      sessionID,
      error: getContinuationError(event),
    })
  }
}
