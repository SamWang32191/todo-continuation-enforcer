import type { Hooks } from "@opencode-ai/plugin"

type ChatMessageHook = NonNullable<Hooks["chat.message"]>

export function createChatMessageHandler(clearStoppedSession: (sessionID: string) => void | Promise<void>): ChatMessageHook {
  return async (...args: Parameters<ChatMessageHook>) => {
    const [{ sessionID }] = args
    await clearStoppedSession(sessionID)
  }
}
