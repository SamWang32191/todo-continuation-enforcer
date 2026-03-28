import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi, MessageInfo } from "../plugin/adapters/session-api"

export async function resolveMessageInfo(args: {
  sessionID: string
  sessionApi: SessionApi
  messageStore: MessageStore
}): Promise<MessageInfo | undefined> {
  const fromApi = await args.sessionApi.getLatestMessageInfo(args.sessionID)

  if (fromApi) {
    return fromApi
  }

  return args.messageStore.findLatestMessageInfo(args.sessionID)
}
