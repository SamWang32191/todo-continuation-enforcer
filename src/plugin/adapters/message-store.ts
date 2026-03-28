import type { MessageInfo } from "./session-api"

export interface MessageStore {
  findLatestMessageInfo(sessionID: string): Promise<MessageInfo | undefined>
}

export function createNoopMessageStore(): MessageStore {
  return {
    async findLatestMessageInfo() {
      return undefined
    },
  }
}
