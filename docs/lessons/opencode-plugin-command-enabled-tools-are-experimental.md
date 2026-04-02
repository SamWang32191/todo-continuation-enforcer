---
id: opencode-plugin-command-enabled-tools-are-experimental
date: 2026-04-02
scope: project
tags: [opencode, plugin, command, config, registration]
source: user-correction
confidence: 0.7
related: [[plugin-tool-context-missing-session-id]]
---

# Prefer config hook registration for OpenCode plugin commands

## Context
在這個 repo 想把 `cancel_next_continuation` 做成使用者可直接觸發的取消入口時，一開始只靠 tool 上的 experimental flags，希望 host 自動把它變成 command。

## Mistake
把 command 註冊綁在 tool 的 experimental flags 上，會讓 host 可能根本沒有正式註冊 command；結果是 README 看起來有入口，但 runtime 不一定真的出現可用 command。

## Lesson
- 正式 plugin command 應優先比照 `just-loop`，在 `config` hook 內把 command 定義 merge 回 `input.command`。
- `tool` 可以保留作為實際執行邏輯或 agent 入口，但不要把「tool flags 會自動變 command」當成主要註冊機制。
- experimental tool flags 若要保留，也只能視為額外 fallback，不應是唯一 command 註冊來源。

## When to Apply
當 OpenCode plugin 需要穩定、可預期的使用者 command 入口時，尤其是你已經有可重用 tool 邏輯，但 host 端仍需要正式 command 註冊的情境。
