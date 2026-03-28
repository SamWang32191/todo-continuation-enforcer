import { MAX_STAGNATION_COUNT } from "./constants"
import type { SessionState } from "./types"

export type StagnationPreview = {
  stagnationCount: number
  lastIncompleteCount: number
  shouldContinue: boolean
}

export function previewStagnationState(state: SessionState, incompleteCount: number): StagnationPreview {
  const stagnationCount = state.lastIncompleteCount === incompleteCount
    ? state.stagnationCount + 1
    : 0
  const lastIncompleteCount = incompleteCount

  return {
    stagnationCount,
    lastIncompleteCount,
    shouldContinue: stagnationCount < MAX_STAGNATION_COUNT,
  }
}

export function commitStagnationState(state: SessionState, preview: StagnationPreview): void {
  state.stagnationCount = preview.stagnationCount
  state.lastIncompleteCount = preview.lastIncompleteCount
}

export function updateStagnationState(state: SessionState, incompleteCount: number): boolean {
  const preview = previewStagnationState(state, incompleteCount)
  commitStagnationState(state, preview)

  return preview.shouldContinue
}
