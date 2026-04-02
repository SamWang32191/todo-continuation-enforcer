---
id: opencode-plugin-command-enabled-tools-are-experimental
date: 2026-04-02
scope: project
tags: [opencode, plugin, command, tool, experimental]
source: user-correction
confidence: 0.7
related: [[plugin-tool-context-missing-session-id]]
---

# OpenCode plugin tools can become slash commands through experimental flags

## Context
在這個 repo 想把 `cancel_next_continuation` 做成使用者可直接觸發的取消入口時，一開始把 plugin custom tool 與 custom command 視為兩條完全分離的能力。

## Mistake
如果只看穩定版 plugin docs，很容易以為 plugin 完全不能提供 slash command，因而把設計過早侷限在 README workaround 或外部 command 檔。

## Lesson
- OpenCode 存在 experimental `pluginCommands` 能力，可把 plugin tool 透過額外 flags 暴露成 slash command fallback。
- 這條路徑是 experimental，不要把它描述成所有 host/runtime 都保證可用的穩定 API。
- 文件與程式都要保守表述：說明它是 fallback、依賴 host 支援，避免硬寫未驗證的固定 slash command 字串。

## When to Apply
當 OpenCode plugin 需要「使用者可手動觸發」的入口，而且現有 TUI keybind / event routing 不足時。
