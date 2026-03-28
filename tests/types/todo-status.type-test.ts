import type { Todo } from "../../src/todo-continuation-enforcer/types"

const validTodo: Todo = {
  content: "implement task 2",
  status: "in_progress",
  priority: "normal",
}

void validTodo

// @ts-expect-error - invalid status must be rejected by the type system
const invalidStatus: Todo["status"] = "anything-else"

void invalidStatus
