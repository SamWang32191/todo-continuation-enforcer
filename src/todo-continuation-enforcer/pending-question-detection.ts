import type { MessageInfo } from "../plugin/adapters/session-api"

export function hasPendingQuestion(messageInfo: MessageInfo | undefined): boolean {
  if (messageInfo?.role !== "assistant") {
    return false
  }

  const text = messageInfo.text?.trim()
  return Boolean(text && /\?\s*$/.test(text))
}
