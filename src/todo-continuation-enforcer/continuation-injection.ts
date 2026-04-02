import type { SessionApi } from "../plugin/adapters/session-api"

import { CONTINUATION_PROMPT } from "./constants"
import { isIncomplete } from "./todo"
import type { Todo } from "./types"

function formatRemainingTodos(todos: readonly Todo[]): string {
  return todos
    .filter(isIncomplete)
    .map((todo) => `- [${todo.status}] ${todo.content}`)
    .join("\n")
}

export async function injectContinuation(args: {
  sessionID: string
  sessionApi: SessionApi
  todos: Todo[]
  agent?: string
  model?: { providerID: string; modelID: string }
}): Promise<void> {
  const remainingTodos = formatRemainingTodos(args.todos)
  const remainingTodosHeading = "Remaining todos:"
  const remainingTodosSection = `${remainingTodosHeading}\n${remainingTodos}`
  const prompt = `${CONTINUATION_PROMPT}\n\n${remainingTodosSection}`

  await args.sessionApi.injectPrompt(args.sessionID, prompt, {
    agent: args.agent,
    model: args.model,
  })
}
