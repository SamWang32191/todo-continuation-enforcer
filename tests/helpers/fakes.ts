import type { BackgroundTaskProbe } from "../../src/plugin/adapters/background-task-probe"
import type { MessageStore } from "../../src/plugin/adapters/message-store"
import type { Logger } from "../../src/plugin/adapters/logger"
import type { MessageInfo, SessionApi } from "../../src/plugin/adapters/session-api"
import type { Todo } from "../../src/todo-continuation-enforcer/types"

export function createFakeLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
  }
}

export function createFakeBackgroundTaskProbe(
  running: boolean | ((sessionID: string) => boolean) = false,
): BackgroundTaskProbe {
  return {
    hasRunningTask(sessionID) {
      return typeof running === "function" ? running(sessionID) : running
    },
  }
}

export function createFakeCountdownToast() {
  const messages: string[] = []

  return {
    messages,
    async showCountdown(message: string) {
      messages.push(message)
    },
    async showCancelled(message: string) {
      messages.push(message)
    },
  }
}

export function createFakeMessageStore(messageInfo?: MessageInfo): MessageStore {
  return {
    async findLatestMessageInfo() {
      return messageInfo
    },
  }
}

export function createMutableFakeMessageStore(initial?: MessageInfo) {
  let messageInfo = initial

  return {
    setMessageInfo(next: MessageInfo | undefined) {
      messageInfo = next
    },
    async findLatestMessageInfo() {
      return messageInfo
    },
  }
}

export function createFakeSessionApi(args?: {
  todos?: Todo[]
  latestMessageInfo?: MessageInfo
  injectPrompt?: (sessionID: string, prompt: string, options?: {
    agent?: string
    model?: { providerID: string; modelID: string }
  }) => Promise<void>
}) {
  const prompts: string[] = []

  const sessionApi: SessionApi & { prompts: string[] } = {
    prompts,
    async getTodos() {
      return args?.todos ?? [{ content: "finish", status: "pending", priority: "high" }]
    },
    async getLatestMessageInfo() {
      if (args && Object.prototype.hasOwnProperty.call(args, "latestMessageInfo")) {
        return args.latestMessageInfo
      }

      return {
        agent: "sisyphus",
        model: { providerID: "openai", modelID: "gpt-5" },
        tools: { write: true, edit: true },
        parts: [{ type: "text", text: "Continuing now." }],
      }
    },
    async injectPrompt(sessionID, prompt, options) {
      prompts.push(prompt)
      await args?.injectPrompt?.(sessionID, prompt, options)
    },
  }

  return sessionApi
}

export function createMutableFakeSessionApi(args?: {
  todos?: Todo[]
  latestMessageInfo?: MessageInfo
}) {
  let todos = args?.todos ?? [{ content: "finish", status: "pending", priority: "high" }]
  let latestMessageInfo = args?.latestMessageInfo
  const prompts: string[] = []

  const sessionApi: SessionApi & {
    prompts: string[]
    setTodos(next: Todo[]): void
    setLatestMessageInfo(next: MessageInfo | undefined): void
  } = {
    prompts,
    setTodos(next) {
      todos = next
    },
    setLatestMessageInfo(next) {
      latestMessageInfo = next
    },
    async getTodos() {
      return todos
    },
    async getLatestMessageInfo() {
      return latestMessageInfo
    },
    async injectPrompt(sessionID, prompt, options) {
      prompts.push(prompt)
      await args?.injectPrompt?.(sessionID, prompt, options)
    },
  }

  return sessionApi
}
