import type { PluginInput } from "@opencode-ai/plugin"

import type { Todo, TodoStatus } from "../../todo-continuation-enforcer/types"

export interface MessageInfo {
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
  tools?: Record<string, boolean>
  text?: string
  role?: "user" | "assistant"
  error?: { name?: string }
}

export interface SessionApi {
  getTodos(sessionID: string): Promise<Todo[]>
  getLatestMessageInfo(sessionID: string): Promise<MessageInfo | undefined>
  injectPrompt(
    sessionID: string,
    prompt: string,
    options?: {
      agent?: string
      model?: { providerID: string; modelID: string }
    },
  ): Promise<void>
}

type SdkMessage = {
  info?: {
    role?: string
    agent?: string
    model?: { providerID?: string; modelID?: string }
    error?: { name?: string }
  }
  parts?: Array<{
    type?: string
    text?: string
    prompt?: string
  }>
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function extractText(parts: SdkMessage["parts"]): string | undefined {
  const text = parts
    ?.filter((part) => isString(part?.type) && part.type === "text")
    .map((part) => (isString(part?.text) ? part.text : isString(part?.prompt) ? part.prompt : ""))
    .filter(Boolean)
    .join("\n")

  return text?.trim() || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isTodoLike(value: unknown): value is Todo {
  if (!isRecord(value)) {
    return false
  }

  const validStatuses: TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"]

  return isString(value.content)
    && isString(value.status)
    && validStatuses.includes(value.status as TodoStatus)
    && isString(value.priority)
    && (value.id === undefined || isString(value.id))
}

function isMessageInfoRecord(value: unknown): value is NonNullable<SdkMessage["info"]> {
  if (!isRecord(value) || !isString(value.role) || !isString(value.agent)) {
    return false
  }

  if (value.role !== "assistant" && value.role !== "user") {
    return false
  }

  if (value.model !== undefined) {
    if (!isRecord(value.model) || !isString(value.model.providerID) || !isString(value.model.modelID)) {
      return false
    }
  }

  if (value.error !== undefined && (!isRecord(value.error) || !isString(value.error.name))) {
    return false
  }

  return true
}

function getMessageRole(role: string): MessageInfo["role"] {
  return role === "assistant" ? "assistant" : "user"
}

function isSdkMessagePart(value: unknown): value is { type: string; text?: string; prompt?: string } {
  if (!isRecord(value) || !isString(value.type)) {
    return false
  }

  return (value.text === undefined || isString(value.text))
    && (value.prompt === undefined || isString(value.prompt))
}

function isSdkMessage(value: unknown): value is SdkMessage {
  if (!isRecord(value) || !isMessageInfoRecord(value.info)) {
    return false
  }

  const { info, parts } = value

  return parts === undefined || (Array.isArray(parts) && parts.every(isSdkMessagePart))
}

function readData<T>(response: unknown): T | undefined {
  if (!isRecord(response)) {
    return undefined
  }

  return response.data as T | undefined
}

function normalizeMessageInfo(message: SdkMessage | undefined): MessageInfo | undefined {
  if (!message?.info) {
    return undefined
  }

  if (!isMessageInfoRecord(message.info)) {
    return undefined
  }

  const text = extractText(message.parts)
  const role = message.info.role

  if (!isString(role)) {
    return undefined
  }

  return {
    agent: message.info.agent,
    model: message.info.model?.providerID && message.info.model?.modelID
      ? {
          providerID: message.info.model.providerID,
          modelID: message.info.model.modelID,
        }
      : undefined,
    error: message.info.error ? { name: message.info.error.name } : undefined,
    role: getMessageRole(role),
    text,
  }
}

function toTodoArray(value: unknown): Todo[] {
  return Array.isArray(value) ? value.filter(isTodoLike) : []
}

function toMessageArray(value: unknown): SdkMessage[] {
  return Array.isArray(value) ? value.filter(isSdkMessage) : []
}

export function createSdkSessionApi(ctx: PluginInput): SessionApi {
  return {
    async getTodos(sessionID) {
      const response = await ctx.client.session.todo({
        path: { id: sessionID },
        query: { directory: ctx.directory },
      })

      return toTodoArray(readData<unknown>(response))
    },
    async getLatestMessageInfo(sessionID) {
      const response = await ctx.client.session.messages({
        path: { id: sessionID },
        query: { directory: ctx.directory, limit: 1 },
      })

      const messages = toMessageArray(readData<unknown>(response))
      return normalizeMessageInfo(messages.at(-1))
    },
    async injectPrompt(sessionID, prompt, options) {
      await ctx.client.session.promptAsync({
        path: { id: sessionID },
        query: { directory: ctx.directory },
        body: {
          agent: options?.agent,
          model: options?.model,
          parts: [{ type: "text", text: prompt }],
        },
      })
    },
  }
}
