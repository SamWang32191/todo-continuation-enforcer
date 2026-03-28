import { describe, expect, it } from "bun:test"
import { isAbortLikeError } from "../../src/todo-continuation-enforcer/abort-detection"

describe("isAbortLikeError", () => {
  it("辨識 MessageAbortedError", () => {
    expect(isAbortLikeError({ name: "MessageAbortedError" })).toBe(true)
  })

  it("辨識 AbortError", () => {
    expect(isAbortLikeError({ name: "AbortError" })).toBe(true)
  })

  it("忽略非 abort 錯誤", () => {
    expect(isAbortLikeError({ name: "OtherError" })).toBe(false)
  })
})
