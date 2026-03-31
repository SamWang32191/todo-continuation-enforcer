export interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
}

export function createConsoleLogger(): Logger {
  return {
    debug(_message, _meta) {
    },
    info(_message, _meta) {
    },
    warn(_message, _meta) {
    },
  }
}
