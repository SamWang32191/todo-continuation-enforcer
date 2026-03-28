---
id: local-opencode-plugin-smoke-test
date: 2026-03-28
scope: project
tags: [opencode, plugin, smoke-test, local-dev, verification]
source: retrospective
confidence: 0.3
related: [[installed-package-plugin-smoke-test]]
---

# Use a temporary XDG config to smoke-test local OpenCode plugins

## Context
在這個 repo 為獨立 plugin 做第一版驗證時，需要證明本地 `dist/index.js` 真的能被 `opencode` 載入，而不想污染使用者現有設定。

## Mistake
如果只跑單元/整合測試，無法證明 host 真的接受 `file://.../dist/index.js` 這種本地 plugin 入口；如果直接改使用者的 `~/.config/opencode/opencode.json`，又會污染真實環境。

## Lesson
- 要做本地 plugin 載入 smoke test 時，優先建立暫時的 `XDG_CONFIG_HOME`。
- 在暫時 config 的 `$XDG_CONFIG_HOME/opencode/opencode.json` 內寫入 `"plugin": ["file:///absolute/path/to/dist/index.js"]`，再執行 `opencode run --print-logs --log-level DEBUG ...`。
- 用日誌中的 `service=plugin path=file:///... loading plugin` 當作 plugin 已被 host 載入的證據。

## When to Apply
當這個 repo 或其他 OpenCode plugin repo 需要驗證「本地 build 產物是否真的被 host 載入」時，尤其是你想避免修改使用者正式設定檔的情況。
