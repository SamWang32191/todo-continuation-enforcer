import { tool, type Hooks, type Plugin, type PluginInput } from "@opencode-ai/plugin"

import { createEventHandler } from "./event-handler"
import { handleConfig } from "./config-handler"
import { createChatMessageHandler } from "./chat-message-handler"
import { createNoopBackgroundTaskProbe } from "./adapters/background-task-probe"
import { createConsoleLogger } from "./adapters/logger"
import { createNoopMessageStore } from "./adapters/message-store"
import { createSdkSessionApi } from "./adapters/session-api"
import { createSdkCountdownToast } from "./adapters/toast"
import { createStopContinuationGuard } from "../stop-continuation-guard/hook"
import { createTodoContinuationEnforcer } from "../todo-continuation-enforcer"

export function createPlugin(options?: { countdownSeconds?: number }): Plugin {
  const plugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
    const guard = createStopContinuationGuard()
    const sessionApi = createSdkSessionApi(ctx)
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      messageStore: createNoopMessageStore(),
      logger: createConsoleLogger(),
      backgroundTaskProbe: createNoopBackgroundTaskProbe(),
      toast: createSdkCountdownToast(ctx),
      countdownSeconds: options?.countdownSeconds ?? 10,
      isContinuationStopped: guard.isStopped,
    })

    const stopSession = async (sessionID: string) => {
      const wasStopped = guard.isStopped(sessionID)
      guard.stop(sessionID)
      await enforcer.cancelPendingWork(sessionID)
      await sessionApi.abort(sessionID)
      return { wasStopped }
    }

    const handleEvent = createEventHandler(async (event) => {
      if (event.type === "session.stop") {
        await stopSession(event.sessionID)
        return
      }

      if (event.type === "session.interrupt") {
        await enforcer.handleEvent(event)
        return
      }

      await enforcer.handleEvent(event)
    })

    return {
      config: handleConfig,
      event: async (args) => {
        const event = args.event as { type?: string } | undefined

        if (event?.type === "session.deleted") {
          await guard.event({ event: args.event as never })
        }

        return handleEvent(args)
      },
      "chat.message": createChatMessageHandler(async (sessionID) => {
        guard.clear(sessionID)
      }),
      tool: {
        stop_continuation: tool({
          description: "Stop continuation for the current session",
          args: {
            sessionID: tool.schema.string().optional(),
          },
          async execute(input, context) {
            const sessionID = input.sessionID ?? context.sessionID
            const result = await stopSession(sessionID)
            return result.wasStopped
              ? `Continuation already stopped for session ${sessionID}.`
              : `Stopped continuation for session ${sessionID}.`
          },
        }),
      },
    }
  }

  return plugin
}
