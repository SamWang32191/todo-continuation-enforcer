import { afterEach, describe, expect, it } from "bun:test"

import { createEventHandler } from "../../src/plugin/event-handler"
import { createPlugin } from "../../src/plugin/create-plugin"
import { createStopContinuationGuard } from "../../src/stop-continuation-guard/hook"
import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
import { CONTINUATION_PROMPT } from "../../src/todo-continuation-enforcer/constants"
import { createFakeBackgroundTaskProbe, createFakeCountdownToast, createFakeLogger, createFakeMessageStore, createFakeSessionApi, createMutableFakeMessageStore } from "../helpers/fakes"
import { createControlledClock } from "../helpers/controlled-clock"

describe("todo continuation enforcer integration", () => {
  let clock: ReturnType<typeof createControlledClock> | undefined

  afterEach(() => {
    clock?.restore()
    clock = undefined
  })

  it("plugin event hook 會把 session.idle 轉給 enforcer", async () => {
    const promptCalls: unknown[] = []
    const plugin = createPlugin({ countdownSeconds: 0 })
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({
            data: [{ content: "finish", status: "pending", priority: "high" }],
          }),
          messages: async () => ({
            data: [
              {
                info: { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } },
                parts: [{ type: "text", text: "keep going" }],
              },
            ],
          }),
          promptAsync: async (args: unknown) => {
            promptCalls.push(args)
          },
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "s1" },
      },
    } as never)

    expect(promptCalls).toHaveLength(1)
  })

  it("session.error 缺 sessionID 時不 throw 且不呼叫 handler", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await expect(handler({ event: { type: "session.error", properties: {} } as never })).resolves.toBeUndefined()

    expect(calls).toHaveLength(0)
  })

  it("session.deleted 缺 info.id 時不 throw 且不呼叫 handler", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await expect(handler({ event: { type: "session.deleted", properties: {} } as never })).resolves.toBeUndefined()

    expect(calls).toHaveLength(0)
  })

  it("session.compacted 正常 payload 會轉給 handler", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await handler({ event: { type: "session.compacted", properties: { sessionID: "s1" } } as never })

    expect(calls).toEqual([{ type: "session.compacted", sessionID: "s1" }])
  })

  it("session.error 會轉給 handler 並保留 error", async () => {
    const calls: Array<{ type: string; sessionID: string; error?: { name?: string } }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await handler({
      event: {
        type: "session.error",
        properties: { sessionID: "s1", error: { name: "AbortError" } },
      } as never,
    })

    expect(calls).toEqual([{ type: "session.error", sessionID: "s1", error: { name: "AbortError" } }])
  })

  it("tui.command.execute 的 session.interrupt 會轉給 handler", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await handler({
      event: {
        type: "tui.command.execute",
        properties: { sessionID: "s1", command: "session.interrupt" },
      } as never,
    })

    expect(calls).toEqual([{ type: "session.interrupt", sessionID: "s1" }])
  })

  it("tui.command.execute 的 stop-continuation 會轉成 session.stop", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await handler({
      event: {
        type: "tui.command.execute",
        properties: { sessionID: "s1", command: "stop-continuation" },
      } as never,
    })

    expect(calls).toEqual([{ type: "session.stop", sessionID: "s1" }])
  })

  it("session.idle 正常 payload 仍會轉給 handler", async () => {
    const calls: Array<{ type: string; sessionID: string }> = []
    const handler = createEventHandler(async (event) => {
      calls.push(event)
    })

    await handler({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })

    expect(calls).toEqual([{ type: "session.idle", sessionID: "s1" }])
  })

  it("idle 且有 incomplete todo 時會注入 continuation", async () => {
    const sessionApi = createFakeSessionApi()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(1)
    expect(sessionApi.prompts[0]).toContain("<system-reminder>\n")
    expect(sessionApi.prompts[0]).toMatch(/\n<\/system-reminder>$/)
    expect(sessionApi.prompts[0]).toContain(CONTINUATION_PROMPT)
    expect(sessionApi.prompts[0]).toContain("Else incomplete tasks remain")
    expect(sessionApi.prompts[0]).toContain("Remaining todos:")
  })

  it("10 秒 countdown 會顯示正確 toast 文案並在完成後注入 continuation", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 10,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(10000)
    await idle

    expect(sessionApi.prompts).toHaveLength(1)
    expect(toast.messages).toEqual([
      "Resuming in 10s... (1 tasks remaining)",
      "Resuming in 9s... (1 tasks remaining)",
      "Resuming in 8s... (1 tasks remaining)",
      "Resuming in 7s... (1 tasks remaining)",
      "Resuming in 6s... (1 tasks remaining)",
      "Resuming in 5s... (1 tasks remaining)",
      "Resuming in 4s... (1 tasks remaining)",
      "Resuming in 3s... (1 tasks remaining)",
      "Resuming in 2s... (1 tasks remaining)",
      "Resuming in 1s... (1 tasks remaining)",
    ])
  })

  it("createPlugin 預設 countdown 是 10 秒", async () => {
    clock = createControlledClock()
    const promptCalls: unknown[] = []
    const toast = createFakeCountdownToast()
    const plugin = createPlugin()
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({
            data: [{ content: "finish", status: "pending", priority: "high" }],
          }),
          messages: async () => ({
            data: [
              {
                info: { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } },
                parts: [{ type: "text", text: "keep going" }],
              },
            ],
          }),
          promptAsync: async (args: unknown) => {
            promptCalls.push(args)
          },
        },
        tui: {
          showToast: async ({ body }: { body?: { message?: string } }) => {
            if (body?.message) toast.messages.push(body.message)
          },
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const idle = hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "s1" },
      },
    } as never)

    await clock.advance(10000)
    await idle

    expect(promptCalls).toHaveLength(1)
    expect(toast.messages[0]).toBe("Resuming in 10s... (1 tasks remaining)")
  })

  it("countdown 後 messageStore 變成 pending question 時會阻擋 fresh recheck inject", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined })
    const messageStore = createMutableFakeMessageStore({
      role: "assistant",
      agent: "sisyphus",
      model: { providerID: "openai", modelID: "gpt-5" },
      text: "Keep going",
    })

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      messageStore,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.05,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(10)
    messageStore.setMessageInfo({
      role: "assistant",
      agent: "sisyphus",
      model: { providerID: "openai", modelID: "gpt-5" },
      text: "Should I continue?",
    })
    await clock.advance(40)
    await idle

    expect(sessionApi.prompts).toHaveLength(0)
  })

  it("fresh recheck 後、inject 前 stop 會阻擋最終注入", async () => {
    const sessionApi = createFakeSessionApi()
    let stopChecks = 0

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
      isContinuationStopped: () => {
        stopChecks += 1
        return stopChecks >= 4
      },
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
    expect(stopChecks).toBe(4)
  })

  it("latest assistant message 是 pending question 時不 inject", async () => {
    const sessionApi = createFakeSessionApi({
      latestMessageInfo: {
        role: "assistant",
        agent: "sisyphus",
        model: { providerID: "openai", modelID: "gpt-5" },
        text: "Should I continue?",
      },
    })

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
    expect(enforcer.getState("s1")?.consecutiveFailures ?? 0).toBe(0)
  })

  it("messageStore 回傳 pending question 時不 inject", async () => {
    const sessionApi = createFakeSessionApi({ latestMessageInfo: undefined })
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      messageStore: createFakeMessageStore({
        role: "assistant",
        agent: "sisyphus",
        model: { providerID: "openai", modelID: "gpt-5" },
        text: "Should I continue?",
      }),
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.01,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
  })

  it("question tool pending 時不 countdown 也不 inject", async () => {
    const sessionApi = createFakeSessionApi({
      latestMessageInfo: {
        role: "assistant",
        agent: "sisyphus",
        model: { providerID: "openai", modelID: "gpt-5" },
        parts: [{ type: "tool_use", name: "question" }],
      },
    })
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      toast,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.05,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(toast.messages).toHaveLength(0)
    expect(sessionApi.prompts).toHaveLength(0)
  })

  it("background task running 時不 inject", async () => {
    const sessionApi = createFakeSessionApi()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(true),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
  })

  it("cooldown 時第二次 idle 不會再次 inject", async () => {
    const sessionApi = createFakeSessionApi()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(1)
  })

  it("inject 失敗時 failure state 可觀察", async () => {
    const sessionApi = createFakeSessionApi()
    sessionApi.injectPrompt = async () => {
      throw new Error("boom")
    }

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
    expect(enforcer.getState("s1")?.consecutiveFailures).toBe(1)
  })

  it("session.deleted 在 countdown 期間會取消注入", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      toast,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 5,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)
    await enforcer.handleEvent({ type: "session.deleted", sessionID: "s1" })
    await idle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)
    expect(toast.messages[0]).toBe("Resuming in 5s... (1 tasks remaining)")
  })

  it("session.error 在 countdown 期間會取消注入", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 5,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)
    await enforcer.handleEvent({ type: "session.error", sessionID: "s1", error: { name: "AbortError" } })
    await idle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)
    expect(toast.messages[0]).toBe("Resuming in 5s... (1 tasks remaining)")
  })

  it("session.interrupt 在 countdown 期間會取消注入", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 5,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)
    await enforcer.handleEvent({ type: "session.interrupt", sessionID: "s1" } as never)
    await idle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)
    expect(toast.messages[0]).toBe("Resuming in 5s... (1 tasks remaining)")
  })

  it("raw session.interrupt 只取消當前 pending cycle，下一個 idle 可直接續跑", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 5,
    })

    const firstIdle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)
    await enforcer.handleEvent({ type: "session.interrupt", sessionID: "s1" } as never)
    await firstIdle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)

    const secondIdle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(5000)
    await secondIdle

    expect(sessionApi.prompts).toHaveLength(1)
    expect(toast.messages.some((message) => message.includes("stopped"))).toBe(true)
  })

  it("cancelPendingWork 會取消 countdown 並顯示取消 toast", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      toast,
      countdownSeconds: 5,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)

    await expect(enforcer.cancelPendingWork("s1")).resolves.toEqual({ status: "cancelled" })

    await idle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)
    expect(toast.messages.some((message) => message.includes("stopped"))).toBe(true)
  })

  it("countdown 期間 todo 變 completed 後不會注入", async () => {
    clock = createControlledClock()
    let todos = [{ content: "finish", status: "in_progress", priority: "high" as const }]
    const prompts: string[] = []

    const sessionApi = {
      async getTodos() {
        return todos
      },
      async getLatestMessageInfo() {
        return {
          agent: "sisyphus",
          model: { providerID: "openai", modelID: "gpt-5" },
        }
      },
      async injectPrompt(_sessionID: string, prompt: string) {
        prompts.push(prompt)
      },
      async abort(_sessionID: string) {},
    }

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.05,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(10)
    todos = [{ content: "finish", status: "completed", priority: "high" }]
    await clock.advance(40)
    await idle
    await clock.advance(100)

    expect(prompts).toHaveLength(0)
  })

  it("session.compacted 在 idle 前會啟動 compaction guard", async () => {
    const sessionApi = createFakeSessionApi()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    await enforcer.handleEvent({ type: "session.compacted", sessionID: "s1" })
    await enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })

    expect(sessionApi.prompts).toHaveLength(0)
  })

  it("session.compacted 在 countdown 期間會取消注入", async () => {
    clock = createControlledClock()
    const sessionApi = createFakeSessionApi()
    const toast = createFakeCountdownToast()

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      toast,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 5,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(1000)
    await enforcer.handleEvent({ type: "session.compacted", sessionID: "s1" })
    await idle
    await clock.advance(5000)

    expect(sessionApi.prompts).toHaveLength(0)
    expect(toast.messages[0]).toBe("Resuming in 5s... (1 tasks remaining)")
  })

  it("stop 後新的 idle 不應續跑，直到 chat.message 清除 stop state", async () => {
    clock = createControlledClock()
    const promptCalls: unknown[] = []
    const abortCalls: string[] = []
    const toastMessages: string[] = []
    const plugin = createPlugin({ countdownSeconds: 5 })
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({ data: [{ content: "finish", status: "pending", priority: "high" }] }),
          messages: async () => ({
            data: [
              {
                info: { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } },
                parts: [{ type: "text", text: "keep going" }],
              },
            ],
          }),
          promptAsync: async (args: unknown) => {
            promptCalls.push(args)
          },
          abort: async (sessionID: string) => {
            abortCalls.push(sessionID)
          },
        },
        tui: {
          showToast: async (options?: { body?: { message?: string } }) => {
            const message = options?.body?.message
            if (message) toastMessages.push(message)
          },
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const idle = hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })
    await clock.advance(1000)

    await hooks.event?.({
      event: {
        type: "tui.command.execute",
        properties: { sessionID: "s1", command: "stop-continuation" },
      } as never,
    })

    await idle
    expect(promptCalls).toHaveLength(0)
    expect(abortCalls).toHaveLength(1)
    expect(toastMessages.some((message) => message.includes("stopped"))).toBe(true)

    const secondIdle = hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })
    await clock.advance(5000)
    await secondIdle
    expect(promptCalls).toHaveLength(0)

    await hooks["chat.message"]?.({ sessionID: "s1" } as never, {} as never)

    const thirdIdle = hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "s1" } } as never })
    await clock.advance(5000)
    await thirdIdle
    expect(promptCalls).toHaveLength(1)
  })

  it("session.deleted 會清 guard 與 runtime state", async () => {
    const guard = createStopContinuationGuard()
    const sessionApi = createFakeSessionApi()
    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
      isContinuationStopped: guard.isStopped,
    })

    guard.stop("s1")
    await guard.event({ event: { type: "session.deleted", properties: { info: { id: "s1" } } } })
    await enforcer.handleEvent({ type: "session.deleted", sessionID: "s1" })

    expect(guard.isStopped("s1")).toBe(false)
    expect(enforcer.getState("s1")).toBeUndefined()
  })

  it("使用者在 final recheck 邊界取消時仍不會注入", async () => {
    clock = createControlledClock()
    let getTodosCallCount = 0
    let releaseFreshTodos: (() => void) | undefined
    const prompts: string[] = []
    const guard = createStopContinuationGuard()

    const sessionApi = {
      async getTodos() {
        getTodosCallCount += 1

        if (getTodosCallCount === 1) {
          return [{ content: "finish", status: "pending", priority: "high" as const }]
        }

        await new Promise<void>((resolve) => {
          releaseFreshTodos = resolve
        })

        return [{ content: "finish", status: "pending", priority: "high" as const }]
      },
      async getLatestMessageInfo() {
        return {
          role: "assistant" as const,
          agent: "sisyphus",
          model: { providerID: "openai", modelID: "gpt-5" },
          text: "keep going",
        }
      },
      async injectPrompt(_sessionID: string, prompt: string) {
        prompts.push(prompt)
      },
      async abort(_sessionID: string) {},
    }

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0.05,
      isContinuationStopped: guard.isStopped,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await clock.advance(50)

    guard.stop("s1")
    await enforcer.cancelPendingWork("s1")

    releaseFreshTodos?.()
    await idle

    expect(prompts).toHaveLength(0)
  })

  it("plugin tool 會使用 context.sessionID 並呼叫 session.abort", async () => {
    const plugin = createPlugin({ countdownSeconds: 5 })
    const abortCalls: string[] = []
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({
            data: [{ content: "finish", status: "pending", priority: "high" }],
          }),
          messages: async () => ({
            data: [
              {
                info: { role: "assistant", agent: "sisyphus", model: { providerID: "openai", modelID: "gpt-5" } },
                parts: [{ type: "text", text: "keep going" }],
              },
            ],
          }),
          promptAsync: async () => ({ data: undefined }),
          abort: async (args: { path: { id: string } }) => {
            abortCalls.push(args.path.id)
            return { data: undefined } as never
          },
        },
        tui: {
          showToast: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const stopTool = (hooks as never as {
      tool?: Record<string, { execute(args: { sessionID?: string }, context: { sessionID: string }): Promise<string> }>
    }).tool?.stop_continuation

    expect(stopTool).toBeDefined()
    await expect(stopTool?.execute({}, { sessionID: "s1" })).resolves.toContain("Stopped continuation for session s1")
    expect(abortCalls).toEqual(["s1"])
  })

  it("plugin stop-continuation command 會走 sticky stop 並在重複 stop 時回傳 already stopped", async () => {
    const plugin = createPlugin({ countdownSeconds: 5 })
    const abortCalls: string[] = []
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
          abort: async (args: { path: { id: string } }) => {
            abortCalls.push(args.path.id)
            return { data: undefined } as never
          },
        },
        tui: {
          showToast: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const stopTool = (hooks as never as {
      tool?: Record<string, { execute(args: { sessionID?: string }, context: { sessionID: string }): Promise<string> }>
    }).tool?.stop_continuation

    expect(stopTool).toBeDefined()
    await expect(stopTool?.execute({}, { sessionID: "s1" })).resolves.toContain("Stopped continuation for session s1")
    await expect(stopTool?.execute({}, { sessionID: "s1" })).resolves.toContain("Continuation already stopped for session s1")
    expect(abortCalls).toEqual(["s1", "s1"])
  })

  it("plugin config 會註冊 formal stop-continuation command", async () => {
    const plugin = createPlugin({ countdownSeconds: 5 })
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
          abort: async () => ({ data: undefined }),
        },
        tui: {
          showToast: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const config: Record<string, unknown> = {
      command: {
        existing: {
          name: "existing",
          description: "Existing command",
          template: "Existing template",
        },
      },
    }

    await hooks.config?.(config as never)

    const commands = config.command as Record<string, { name?: string; description?: string; template?: string }>

    expect(commands.existing).toBeDefined()
    expect(commands["stop-continuation"]).toMatchObject({
      name: "stop-continuation",
    })
    expect(commands["stop-continuation"]?.description).toContain("Stop")
    expect(commands["stop-continuation"]?.template).toContain("stop_continuation")
  })

  it("plugin tool 不傳 sessionID 時會使用 context.sessionID", async () => {
    const plugin = createPlugin({ countdownSeconds: 5 })
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
          abort: async () => ({ data: undefined }),
        },
        tui: {
          showToast: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const stopTool = (hooks as never as {
      tool?: Record<string, { execute(args: any, context: any): Promise<string> }>
    }).tool?.stop_continuation

    expect(stopTool).toBeDefined()
    await expect(stopTool?.execute({}, { sessionID: "ctx-s1" })).resolves.toContain("ctx-s1")
  })

  it("plugin tool 傳入 sessionID 時仍以顯式值為準", async () => {
    const plugin = createPlugin({ countdownSeconds: 5 })
    const hooks = await plugin({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
          abort: async () => ({ data: undefined }),
        },
        tui: {
          showToast: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      project: {} as never,
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    const stopTool = (hooks as never as {
      tool?: Record<string, { execute(args: any, context: any): Promise<string> }>
    }).tool?.stop_continuation

    expect(stopTool).toBeDefined()
    await expect(stopTool?.execute({ sessionID: "explicit-s1" }, { sessionID: "ctx-s1" })).resolves.toContain("explicit-s1")
  })

  it("injectPrompt 已開始後再取消，不會回報假成功", async () => {
    let releaseInject: (() => void) | undefined
    let markInjectStarted: (() => void) | undefined
    const injectStarted = new Promise<void>((resolve) => {
      markInjectStarted = resolve
    })
    const sessionApi = createFakeSessionApi({
      injectPrompt: async () => {
        markInjectStarted?.()
        await new Promise<void>((resolve) => {
          releaseInject = resolve
        })
      },
    })

    const enforcer = createTodoContinuationEnforcer({
      sessionApi,
      logger: createFakeLogger(),
      backgroundTaskProbe: createFakeBackgroundTaskProbe(),
      countdownSeconds: 0,
    })

    const idle = enforcer.handleEvent({ type: "session.idle", sessionID: "s1" })
    await injectStarted

    await enforcer.handleEvent({ type: "session.interrupt", sessionID: "s1" })

    releaseInject?.()
    await idle
    expect(sessionApi.prompts).toHaveLength(1)
  })
})
