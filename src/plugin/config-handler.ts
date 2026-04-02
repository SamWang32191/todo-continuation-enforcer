import { getBuiltinCommands } from "./command-definitions"

export async function handleConfig(input: Record<string, unknown>) {
  const existingCommands =
    input.command && typeof input.command === "object"
      ? (input.command as Record<string, unknown>)
      : {}

  input.command = {
    ...getBuiltinCommands(),
    ...existingCommands,
  }
}
