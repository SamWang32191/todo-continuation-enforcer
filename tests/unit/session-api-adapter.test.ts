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
})
