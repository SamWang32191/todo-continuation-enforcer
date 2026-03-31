import type { MessageInfo } from "../plugin/adapters/session-api"

export function hasPendingQuestion(messageInfo: MessageInfo | undefined): boolean {
  if (messageInfo?.role !== "assistant") {
    return false
  }

  const text = messageInfo.text?.trim()
  const hasQuestionText = Boolean(text && /[?？]\s*$/.test(text))
  const hasQuestionToolInvocation = messageInfo.parts?.some(
    (part) => (part.type === "tool_use" || part.type === "tool-invocation")
      && (part.name === "question" || part.toolName === "question"),
  ) ?? false

  return hasQuestionText || hasQuestionToolInvocation
}
