export function isAbortLikeError(error: { name?: string } | undefined): boolean {
  if (!error) {
    return false
  }

  return error.name === "AbortError" || error.name === "MessageAbortedError"
}
