import type { BackgroundTaskProbe } from "../../src/plugin/adapters/background-task-probe"
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
      }
    },
    async injectPrompt(sessionID, prompt, options) {
      prompts.push(prompt)
      await args?.injectPrompt?.(sessionID, prompt, options)
    },
  }

  return sessionApi
}
