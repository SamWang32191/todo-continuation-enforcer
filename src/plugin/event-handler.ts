import type { Hooks } from "@opencode-ai/plugin"

import type { ContinuationEvent } from "../todo-continuation-enforcer/handler"
import { CANCEL_NEXT_CONTINUATION_COMMAND_NAME } from "./command-definitions"

type PluginEventType = ContinuationEvent["type"] | "tui.command.execute"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPluginEventType(type: unknown): type is PluginEventType {
  return type === "session.idle"
    || type === "session.error"
    || type === "session.deleted"
    || type === "session.compacted"
    || type === "session.interrupt"
    || type === "tui.command.execute"
}

function isSessionInterruptCommand(event: unknown): boolean {
  if (!isRecord(event) || event.type !== "tui.command.execute") {
    return false
  }

  const properties = isRecord(event.properties) ? event.properties : undefined
  return properties?.command === "session.interrupt"
    || properties?.command === CANCEL_NEXT_CONTINUATION_COMMAND_NAME
}

function getSessionID(event: unknown): string | undefined {
  if (!isRecord(event) || !isPluginEventType(event.type)) {
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
    case "session.interrupt":
    case "tui.command.execute":
      if (typeof properties?.sessionID === "string") {
        return properties.sessionID
      }

      return isRecord(properties?.info) && typeof properties.info.id === "string" ? properties.info.id : undefined
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
    if (!isRecord(event) || !isPluginEventType(event.type)) {
      return
    }

    if (event.type === "tui.command.execute" && !isSessionInterruptCommand(event)) {
      return
    }

    const sessionID = getSessionID(event)

    if (!sessionID) {
      return
    }

    await handleEvent({
      type: event.type === "tui.command.execute" ? "session.interrupt" : event.type,
      sessionID,
      error: getContinuationError(event),
    })
  }
}
