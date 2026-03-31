type TimerKind = "timeout" | "interval"

type TimerEntry = {
  id: number
  kind: TimerKind
  dueAt: number
  delay: number
  callback: (...args: never[]) => void
  cleared: boolean
}

export function createControlledClock(startAt = 0) {
  const globalAny = globalThis as typeof globalThis & {
    setTimeout: typeof globalThis.setTimeout
    clearTimeout: typeof globalThis.clearTimeout
    setInterval: typeof globalThis.setInterval
    clearInterval: typeof globalThis.clearInterval
  }

  const original = {
    setTimeout: globalAny.setTimeout,
    clearTimeout: globalAny.clearTimeout,
    setInterval: globalAny.setInterval,
    clearInterval: globalAny.clearInterval,
    dateNow: Date.now,
  }

  let now = startAt
  let nextId = 1
  const timers = new Map<number, TimerEntry>()

  const schedule = (kind: TimerKind, callback: TimerEntry["callback"], delay = 0) => {
    const id = nextId++
    timers.set(id, {
      id,
      kind,
      dueAt: now + Math.max(0, delay),
      delay: Math.max(0, delay),
      callback,
      cleared: false,
    })
    return id
  }

  const fakeSetTimeout: typeof globalThis.setTimeout = ((callback: TimerEntry["callback"], delay?: number) => {
    return schedule("timeout", callback, delay)
  }) as typeof globalThis.setTimeout

  const fakeSetInterval: typeof globalThis.setInterval = ((callback: TimerEntry["callback"], delay?: number) => {
    return schedule("interval", callback, delay)
  }) as typeof globalThis.setInterval

  const clearTimer = (handle: number | undefined) => {
    if (typeof handle !== "number") {
      return
    }

    const timer = timers.get(handle)
    if (!timer) {
      return
    }

    timer.cleared = true
    timers.delete(handle)
  }

  globalAny.setTimeout = fakeSetTimeout
  globalAny.clearTimeout = clearTimer as typeof globalThis.clearTimeout
  globalAny.setInterval = fakeSetInterval
  globalAny.clearInterval = clearTimer as typeof globalThis.clearInterval
  Date.now = () => now

  const flushMicrotasks = async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve()
    }
  }

  return {
    get now() {
      return now
    },
    async advance(ms: number) {
      const target = now + Math.max(0, ms)

      await flushMicrotasks()

      while (true) {
        const nextTimer = [...timers.values()]
          .filter((timer) => !timer.cleared && timer.dueAt <= target)
          .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0]

        if (!nextTimer) {
          break
        }

        now = nextTimer.dueAt

        if (nextTimer.kind === "timeout") {
          timers.delete(nextTimer.id)
        }

        nextTimer.callback()

        if (nextTimer.kind === "interval") {
          const stillActive = timers.get(nextTimer.id)
          if (stillActive && !stillActive.cleared) {
            stillActive.dueAt = now + stillActive.delay
          }
        }

        await flushMicrotasks()
      }

      now = target
      await flushMicrotasks()
    },
    restore() {
      timers.clear()
      now = startAt
      globalAny.setTimeout = original.setTimeout
      globalAny.clearTimeout = original.clearTimeout
      globalAny.setInterval = original.setInterval
      globalAny.clearInterval = original.clearInterval
      Date.now = original.dateNow
    },
  }
}
