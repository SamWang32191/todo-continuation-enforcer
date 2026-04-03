import { describe, expect, it } from "bun:test"

import { createStopContinuationGuard } from "../../src/stop-continuation-guard/hook"

describe("stop-continuation-guard", () => {
  it("stop 後 isStopped 變 true，clear 後清掉", async () => {
    const guard = createStopContinuationGuard()

    guard.stop("session-1")

    expect(guard.isStopped("session-1")).toBe(true)

    guard.clear("session-1")

    expect(guard.isStopped("session-1")).toBe(false)
  })

  it("session.deleted 會清掉 stop state", async () => {
    const guard = createStopContinuationGuard()

    guard.stop("session-1")

    await guard.event({ event: { type: "session.deleted", properties: { info: { id: "session-1" } } } })

    expect(guard.isStopped("session-1")).toBe(false)
  })

  it("非 session.deleted 不會清掉 stop state", async () => {
    const guard = createStopContinuationGuard()

    guard.stop("session-1")

    await guard.event({ event: { type: "session.updated", properties: { info: { id: "session-1" } } } })

    expect(guard.isStopped("session-1")).toBe(true)
  })

  it("缺 info.id 或型別錯誤不會清掉 stop state", async () => {
    const guard = createStopContinuationGuard()

    guard.stop("session-1")

    await guard.event({ event: { type: "session.deleted", properties: { info: {} } } })
    await guard.event({ event: { type: "session.deleted", properties: { info: { id: 123 } } } })
    await guard.event({ event: { type: "session.deleted", properties: { info: "oops" } } })

    expect(guard.isStopped("session-1")).toBe(true)
  })

  it("session.deleted 指向其他 session 不會誤清目前 session", async () => {
    const guard = createStopContinuationGuard()

    guard.stop("session-1")
    guard.stop("session-2")

    await guard.event({ event: { type: "session.deleted", properties: { info: { id: "session-2" } } } })

    expect(guard.isStopped("session-1")).toBe(true)
    expect(guard.isStopped("session-2")).toBe(false)
  })

})
