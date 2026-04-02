---
id: formal-command-events-should-backstop-tool-context-session-id
date: 2026-04-03
scope: project
tags: [opencode, plugin, command, session-id, fallback]
source: bug-fix
confidence: 0.5
related: [[plugin-tool-context-missing-session-id]]
---

# Formal command 的取消流程要優先吃 command event 的 session，再把 tool context 當 fallback

## Context
在這個 repo 中，`/cancel-next-continuation` 是給使用者直接取消下一次 continuation 的 formal command；同時也有 `cancel_next_continuation` tool 給 agent 呼叫。

## Mistake
如果只依賴 tool `execute()` 的 `context.sessionID` 來做 session-scoped 取消，host 一旦沒把 session context 傳進 tool，command 看起來就會失效；但 countdown 其實仍在跑。

## Lesson
- 對 session-scoped formal command，若 host 會先送出 `tui.command.execute` 且 event payload 帶有 session ID，plugin 應直接把這條事件路徑視為主要取消入口。
- tool context 應只作為 fallback，不應是 formal command 唯一的 session 來源。
- event handler 若已知某個 command 與既有行為等價（例如取消 countdown），應把它轉成同一個 domain event，避免 command 與 tool 兩條路行為分岔。

## When to Apply
當 OpenCode plugin 需要支援 formal command 與 internal tool 的雙入口，而且兩者都要作用在「目前 session」這種 runtime scope 上時。
