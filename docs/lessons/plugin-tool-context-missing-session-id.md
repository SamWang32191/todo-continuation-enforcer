---
id: plugin-tool-context-missing-session-id
date: 2026-04-02
scope: project
tags: [opencode, plugin, tool, session-id, sdk]
source: retrospective
confidence: 0.3
related: []
---

# OpenCode plugin tool context 不要假設有 sessionID

## Context
在為這個 repo 新增使用者可主動取消下一次 continuation 注入的 tool 入口時，需要知道 tool `execute()` 能不能直接取得目前 session。

## Mistake
如果直接假設 plugin tool context 會提供 sessionID，很容易把設計綁在不存在的欄位上，導致實作到一半才發現 tool 無法定位要取消哪個 session。

## Lesson
- 在 `@opencode-ai/plugin` 的 tool 入口中，不要預設 `execute()` context 會提供 sessionID。
- 若功能必須作用於特定 session，優先把 `sessionID` 設計成明確的 tool argument。
- 若未來 SDK 新增 session-aware tool context，再把顯式參數改成可選，而不是一開始就依賴未證實的欄位。

## When to Apply
當這個 repo 或其他 OpenCode plugin repo 要新增 custom tool，且 tool 行為需要鎖定特定 session、conversation、或類似 runtime scope 時。
