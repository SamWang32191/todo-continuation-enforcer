export const CANCEL_NEXT_CONTINUATION_COMMAND_NAME = "cancel-next-continuation"

const CANCEL_NEXT_CONTINUATION_TEMPLATE = `Cancel the next pending continuation injection for the current session.

Use the internal \`cancel_next_continuation\` tool to perform the cancellation.

- Prefer the current session context when available.
- If the tool reports there is no pending continuation, tell the user plainly.
- If the tool reports cancellation succeeded, confirm that the next continuation was cancelled.`

export type CommandDefinition = {
  name: string
  description: string
  template: string
}

export function getBuiltinCommands(): Record<string, CommandDefinition> {
  return {
    [CANCEL_NEXT_CONTINUATION_COMMAND_NAME]: {
      name: CANCEL_NEXT_CONTINUATION_COMMAND_NAME,
      description: "(builtin) Cancel the next pending continuation injection",
      template: `<command-instruction>
${CANCEL_NEXT_CONTINUATION_TEMPLATE}
</command-instruction>`,
    },
  }
}
