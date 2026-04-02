import { tool, type Hooks, type Plugin, type PluginInput } from "@opencode-ai/plugin"

import { createEventHandler } from "./event-handler"
import { createNoopBackgroundTaskProbe } from "./adapters/background-task-probe"
import { createConsoleLogger } from "./adapters/logger"
import { createNoopMessageStore } from "./adapters/message-store"
import { createSdkSessionApi } from "./adapters/session-api"
import { createSdkCountdownToast } from "./adapters/toast"
import { createTodoContinuationEnforcer } from "../todo-continuation-enforcer"

export function createPlugin(options?: { countdownSeconds?: number }): Plugin {
  const plugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
    const enforcer = createTodoContinuationEnforcer({
      sessionApi: createSdkSessionApi(ctx),
      messageStore: createNoopMessageStore(),
      logger: createConsoleLogger(),
      backgroundTaskProbe: createNoopBackgroundTaskProbe(),
      toast: createSdkCountdownToast(ctx),
      countdownSeconds: options?.countdownSeconds ?? 10,
    })

    return {
      event: createEventHandler(enforcer.handleEvent),
      tool: {
        cancel_next_continuation: tool({
          description: "Cancel the next pending continuation injection for a session",
          args: {
            sessionID: tool.schema.string(),
          },
          async execute(input) {
            const result = await enforcer.cancelNextContinuation(input.sessionID)

            if (result.status === "cancelled") {
              return `Cancelled next continuation for session ${input.sessionID}.`
            }

            return `No pending continuation to cancel for session ${input.sessionID}.`
          },
        }),
      },
    }
  }

  return plugin
}
