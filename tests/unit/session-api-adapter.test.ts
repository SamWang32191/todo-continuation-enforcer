import { describe, expect, it } from "bun:test"

import { createSdkSessionApi } from "../../src/plugin/adapters/session-api"

describe("createSdkSessionApi runtime narrowing", () => {
  it("malformed message payload 會安全降級為 undefined", async () => {
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({
            data: [{
              info: {
                role: "assistant",
                agent: 123,
                model: { providerID: 456, modelID: "gpt-5" },
                error: { name: 789 },
              },
              parts: [
                { type: "text", text: "ok" },
                { type: "reasoning", text: "should be ignored" },
                { type: 123, prompt: "bad" },
              ],
            }],
          }),
          promptAsync: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await expect(api.getLatestMessageInfo("s1")).resolves.toBeUndefined()
  })

  it("todo payload 只保留合法 todo", async () => {
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({
            data: [
              { content: "keep", status: "pending", priority: "high" },
              { content: "keep-progress", status: "in_progress", priority: "high" },
              { content: "drop-typed-bad", status: 123, priority: "high" },
              { content: "drop-bogus-status", status: "bogus", priority: "high" },
              { content: 999, status: "pending", priority: "high" },
            ],
          }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await expect(api.getTodos("s1")).resolves.toEqual([
      { content: "keep", status: "pending", priority: "high" },
      { content: "keep-progress", status: "in_progress", priority: "high" },
    ])
  })

  it("latest message 會保留 parts", async () => {
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({
            data: [{
              info: {
                role: "assistant",
                agent: "sisyphus",
                model: { providerID: "openai", modelID: "gpt-5" },
              },
              parts: [
                { type: "tool", name: "question", toolName: "question", prompt: "Should I continue?" },
                { type: "text", text: "keep going" },
              ],
            }],
          }),
          promptAsync: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await expect(api.getLatestMessageInfo("s1")).resolves.toEqual({
      agent: "sisyphus",
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [
        { type: "tool", name: "question", toolName: "question", prompt: "Should I continue?" },
        { type: "text", text: "keep going" },
      ],
      role: "assistant",
      text: "keep going",
    })
  })

  it("缺 agent 但其他欄位合法時仍保留 message", async () => {
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({
            data: [{
              info: {
                role: "assistant",
                model: { providerID: "openai", modelID: "gpt-5" },
              },
              parts: [{ type: "text", text: "keep going" }],
            }],
          }),
          promptAsync: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await expect(api.getLatestMessageInfo("s1")).resolves.toEqual({
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [{ type: "text", text: "keep going" }],
      role: "assistant",
      text: "keep going",
    })
  })

  it("error 空物件仍能保留 message", async () => {
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({
            data: [{
              info: {
                role: "assistant",
                agent: "sisyphus",
                model: { providerID: "openai", modelID: "gpt-5" },
                error: {},
              },
              parts: [{ type: "text", text: "keep going" }],
            }],
          }),
          promptAsync: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await expect(api.getLatestMessageInfo("s1")).resolves.toEqual({
      agent: "sisyphus",
      error: { name: undefined },
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [{ type: "text", text: "keep going" }],
      role: "assistant",
      text: "keep going",
    })
  })

  it("abort 會轉呼叫 SDK session.abort", async () => {
    const abortCalls: Array<{ id: string; directory: string }> = []
    const api = createSdkSessionApi({
      client: {
        session: {
          todo: async () => ({ data: [] }),
          messages: async () => ({ data: [] }),
          promptAsync: async () => ({ data: undefined }),
          abort: async (args: { path: { id: string }; query: { directory: string } }) => {
            abortCalls.push({ id: args.path.id, directory: args.query.directory })
          },
        },
      },
      directory: "/tmp",
      worktree: "/tmp",
      project: {} as never,
      serverUrl: new URL("http://localhost"),
      $: {} as never,
    })

    await api.abort("s1")

    expect(abortCalls).toEqual([{ id: "s1", directory: "/tmp" }])
  })
})
