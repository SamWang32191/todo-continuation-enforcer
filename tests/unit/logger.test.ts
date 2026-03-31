import { describe, expect, it } from "bun:test"

import { createConsoleLogger } from "../../src/plugin/adapters/logger"

describe("createConsoleLogger", () => {
  it("does not write any console output", () => {
    const calls: Array<[method: string, message: string, meta?: unknown]> = []

    const originalDebug = console.debug
    const originalInfo = console.info
    const originalWarn = console.warn

    console.debug = ((message: string, meta?: unknown) => {
      calls.push(["debug", message, meta])
    }) as typeof console.debug
    console.info = ((message: string, meta?: unknown) => {
      calls.push(["info", message, meta])
    }) as typeof console.info
    console.warn = ((message: string, meta?: unknown) => {
      calls.push(["warn", message, meta])
    }) as typeof console.warn

    try {
      const logger = createConsoleLogger()

      logger.debug("skip continuation", { shouldInject: false })
      logger.info("info message", { ok: true })
      logger.warn("warn message", { ok: false })

      expect(calls).toEqual([])
    } finally {
      console.debug = originalDebug
      console.info = originalInfo
      console.warn = originalWarn
    }
  })
})
