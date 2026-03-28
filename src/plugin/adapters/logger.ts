export interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
}

export function createConsoleLogger(): Logger {
  return {
    debug(message, meta) {
      console.debug(message, meta)
    },
    info(message, meta) {
      console.info(message, meta)
    },
    warn(message, meta) {
      console.warn(message, meta)
    },
  }
}
