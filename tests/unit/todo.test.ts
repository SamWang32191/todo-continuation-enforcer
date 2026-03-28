import { describe, expect, it } from "bun:test"
import { getIncompleteCount } from "../../src/todo-continuation-enforcer/todo"
import type { Todo } from "../../src/todo-continuation-enforcer/types"

describe("getIncompleteCount", () => {
  it("會把 in_progress 也算作未完成 todo", () => {
    const todos: Todo[] = [
      { content: "a", status: "pending", priority: "normal", id: "1" },
      { content: "a2", status: "in_progress", priority: "normal", id: "1-2" },
      { content: "b", status: "completed", priority: "normal", id: "2" },
      { content: "c", status: "cancelled", priority: "normal", id: "3" },
      { content: "d", status: "pending", priority: "normal" },
    ]

    const count = getIncompleteCount(todos)

    expect(count).toBe(3)
  })
})
