import { COMPACTION_GUARD_MS } from "./constants"
import type { SessionState } from "./types"

export function isCompactionGuardActive(state: SessionState | undefined, now: number): boolean {
  return state?.recentCompactionAt !== undefined && now - state.recentCompactionAt < COMPACTION_GUARD_MS
}
