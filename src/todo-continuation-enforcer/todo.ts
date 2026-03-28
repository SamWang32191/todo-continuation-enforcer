import type { Todo, TodoStatus } from "./types"

function isIncompleteStatus(status: TodoStatus): boolean {
  return status === "pending" || status === "in_progress"
}

export function isIncomplete(todo: Todo): boolean {
  return isIncompleteStatus(todo.status)
}

export function getIncompleteCount(todos: readonly Todo[]): number {
  return todos.reduce((count, todo) => count + (isIncomplete(todo) ? 1 : 0), 0)
}
