import type { PluginInput } from "@opencode-ai/plugin"

import { TOAST_DURATION_MS } from "../../todo-continuation-enforcer/constants"

export interface CountdownToast {
  showCountdown(message: string): Promise<void>
}

export function createSdkCountdownToast(ctx: PluginInput): CountdownToast {
  return {
    async showCountdown(message) {
      try {
        await ctx.client.tui?.showToast?.({
          body: {
            title: "Todo Continuation",
            message,
            variant: "warning",
            duration: TOAST_DURATION_MS,
          },
        })
      } catch {
      }
    },
  }
}

export function createNoopCountdownToast(): CountdownToast {
  return {
    async showCountdown() {},
  }
}
