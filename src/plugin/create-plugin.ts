import { tool, type Hooks, type Plugin, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"

import { createEventHandler } from "./event-handler"
import { createNoopBackgroundTaskProbe } from "./adapters/background-task-probe"
import { createConsoleLogger } from "./adapters/logger"
import { createNoopMessageStore } from "./adapters/message-store"
import { createSdkSessionApi } from "./adapters/session-api"
import { createSdkCountdownToast } from "./adapters/toast"
import { createTodoContinuationEnforcer } from "../todo-continuation-enforcer"

type ExperimentalCommandEnabledToolDefinition = ToolDefinition & {
  /**
   * Best-effort support for OpenCode experimental pluginCommands.
   * The current SDK types do not expose these flags yet, but hosts that
   * support pluginCommands can read them from the tool definition.
   */
  command: true
  directExecution: true
}

function createCommandEnabledTool(definition: ToolDefinition): ExperimentalCommandEnabledToolDefinition {
  return {
    ...definition,
    command: true,
    directExecution: true,
  }
}

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
        cancel_next_continuation: createCommandEnabledTool(tool({
          description: "Cancel the next pending continuation injection for a session",
          args: {
            sessionID: tool.schema.string().optional(),
          },
          async execute(input, context) {
            const sessionID = input.sessionID ?? context.sessionID
            const result = await enforcer.cancelNextContinuation(sessionID)

            if (result.status === "cancelled") {
              return `Cancelled next continuation for session ${sessionID}.`
            }

            return `No pending continuation to cancel for session ${sessionID}.`
          },
        })),
      },
    }
  }

  return plugin
}
