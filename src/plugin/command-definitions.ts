export const STOP_CONTINUATION_COMMAND_NAME = "stop-continuation"

const STOP_CONTINUATION_TEMPLATE = `Stop continuation for the current session.

Use the internal \`stop_continuation\` tool to stop continuation for this session.

- Prefer the current session context when available.
- Abort the active session run when continuation is stopped.
- Continuation remains stopped until a new user message arrives.
- If continuation is already stopped, return success and keep it stopped.
- Confirm that continuation is stopped for this session.`

export type CommandDefinition = {
  name: string
  description: string
  template: string
}

export function getBuiltinCommands(): Record<string, CommandDefinition> {
  return {
    [STOP_CONTINUATION_COMMAND_NAME]: {
      name: STOP_CONTINUATION_COMMAND_NAME,
      description: "(builtin) Stop continuation for the current session",
      template: `<command-instruction>
${STOP_CONTINUATION_TEMPLATE}
</command-instruction>`,
    },
  }
}
