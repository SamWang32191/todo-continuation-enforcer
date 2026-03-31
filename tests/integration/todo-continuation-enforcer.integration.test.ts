import { afterEach, describe, expect, it } from "bun:test"

import { createEventHandler } from "../../src/plugin/event-handler"
import { createPlugin } from "../../src/plugin/create-plugin"
import { createTodoContinuationEnforcer } from "../../src/todo-continuation-enforcer"
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
    expect(sessionApi.prompts[0]).toContain("Incomplete tasks remain")
    expect(sessionApi.prompts[0]).toContain("Remaining todos")
  })

  it("5 秒 countdown 會顯示正確 toast 文案並在完成後注入 continuation", async () => {
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
    await clock.advance(5000)
    await idle

    expect(sessionApi.prompts).toHaveLength(1)
    expect(toast.messages).toEqual([
      "Resuming in 5s... (1 tasks remaining)",
      "Resuming in 4s... (1 tasks remaining)",
      "Resuming in 3s... (1 tasks remaining)",
      "Resuming in 2s... (1 tasks remaining)",
      "Resuming in 1s... (1 tasks remaining)",
    ])
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
})
