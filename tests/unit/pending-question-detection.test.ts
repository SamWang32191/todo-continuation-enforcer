import { describe, expect, it } from "bun:test"

import { hasPendingQuestion } from "../../src/todo-continuation-enforcer/pending-question-detection"

describe("hasPendingQuestion", () => {
  it("assistant 訊息尾端是問號時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        text: "Should I continue?",
      }),
    ).toBe(true)
  })

  it("assistant 訊息尾端是全形問號時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        text: "Should I continue？",
      }),
    ).toBe(true)
  })

  it("assistant 訊息有 question tool invocation 時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        parts: [
          {
            type: "tool_use",
            name: "question",
            toolName: "question",
            prompt: "Should I continue?",
          },
        ],
      }),
    ).toBe(true)
  })

  it("assistant 訊息有 tool-invocation 時回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        parts: [
          {
            type: "tool-invocation",
            name: "question",
            toolName: "question",
            prompt: "Should I continue?",
          },
        ],
      }),
    ).toBe(true)
  })

  it("assistant 訊息只有 tool type 不應命中", () => {
    expect(
      hasPendingQuestion({
        role: "assistant",
        parts: [
          {
            type: "tool",
            name: "question",
            toolName: "question",
            prompt: "Should I continue?",
          },
        ],
      }),
    ).toBe(false)
  })

  it("非 assistant 訊息不回傳 true", () => {
    expect(
      hasPendingQuestion({
        role: "user",
        text: "Should I continue?",
      }),
    ).toBe(false)
  })
})
