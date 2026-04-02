import { createSystemDirective } from "../shared/system-directive"

export const HOOK_NAME = "todo-continuation-enforcer"
export const DEFAULT_SKIP_AGENTS = ["prometheus", "compaction", "plan"]
export const COUNTDOWN_SECONDS = 5
export const TOAST_DURATION_MS = 900
export const ABORT_WINDOW_MS = 3_000
export const COMPACTION_GUARD_MS = 60_000
export const CONTINUATION_COOLDOWN_MS = 5_000
export const MAX_STAGNATION_COUNT = 3
export const MAX_CONSECUTIVE_FAILURES = 5
export const FAILURE_RESET_WINDOW_MS = 5 * 60_000

const QUESTION_TOOL_INSTRUCTION =
  "If you need a user response or confirmation, use the QUESTION TOOL ask again instead of asking in plain text."

const CONTINUATION_BEHAVIOR_LINES = [
  "- Proceed without asking for permission",
  "- Mark each task complete when finished",
  "- Do not stop until all tasks are done",
  "- If you believe all work is already complete, critically re-check each todo item and update the todo list accordingly.",
]

const CONTINUATION_CONTEXT_PARAGRAPH = `${createSystemDirective("TODO_CONTINUATION")}\n${QUESTION_TOOL_INSTRUCTION}`

const CONTINUATION_ACTION_PARAGRAPH = [
  "Else incomplete tasks remain in your todo list. Continue working on the next pending task.",
  ...CONTINUATION_BEHAVIOR_LINES,
].join("\n")

const CONTINUATION_PROMPT_PARAGRAPHS = [CONTINUATION_CONTEXT_PARAGRAPH, CONTINUATION_ACTION_PARAGRAPH]

export const CONTINUATION_PROMPT = CONTINUATION_PROMPT_PARAGRAPHS.join("\n\n")
