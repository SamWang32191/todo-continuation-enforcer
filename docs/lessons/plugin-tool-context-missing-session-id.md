---
id: plugin-tool-context-missing-session-id
date: 2026-04-02
scope: project
tags: [opencode, plugin, tool, session-id, sdk]
source: retrospective
confidence: 0.3
related: []
---

# OpenCode plugin tool context 的 session 資訊要先看當前 SDK，再決定參數設計

## Context
在為這個 repo 新增使用者可主動取消下一次 continuation 注入的 tool / command 入口時，需要知道 tool `execute()` 能不能直接取得目前 session。

## Mistake
如果用舊印象直接假設 plugin tool context 沒有 `sessionID`，很容易把 API 設計成「一定要手動傳 sessionID」，讓 command UX 變差；反過來，如果不查 SDK 就直接假設一定有，也可能在版本差異下踩雷。

## Lesson
- 在設計 OpenCode plugin tool API 前，先檢查目前安裝版本的 `@opencode-ai/plugin` 型別與官方實作，不要靠舊印象。
- 若 `ToolContext` 已提供 `sessionID`，優先讓 session-scoped tool 支援「顯式參數可覆蓋、否則 fallback 到 context.sessionID」。
- 若功能跨版本相容性重要，README 要明說哪些行為依賴 host / SDK 版本，而不是把單一版本觀察寫成永遠成立的規則。

## When to Apply
當這個 repo 或其他 OpenCode plugin repo 要新增 custom tool，且 tool 行為需要鎖定特定 session、conversation、或類似 runtime scope 時。
