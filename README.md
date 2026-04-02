# todo-continuation-enforcer

Standalone OpenCode plugin that continues unfinished todos when a session becomes idle.

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["todo-continuation-enforcer"]
}
```

You can place this in either:

- `opencode.json`
- `~/.config/opencode/opencode.json`

## Usage

OpenCode will install and load npm plugins declared in `opencode.json` automatically on startup.

By default, the plugin waits 10 seconds before injecting a continuation prompt when a session becomes idle.
At the source/internals level, `countdownSeconds` can be overridden for custom setups.

### Cancellation caveat

This plugin listens for high-level OpenCode events such as `session.idle`, `session.error`, and `session.interrupt`.
It does **not** receive raw keyboard events directly.

- If OpenCode routes `Escape` to `session_interrupt`, the pending countdown is canceled.
- If the host does **not** emit `session_interrupt` after the session is already idle, this plugin cannot observe raw `Escape` by itself.

The plugin exposes two cancellation entry points:

- `/cancel-next-continuation` for users, and
- `cancel_next_continuation` as an internal tool for the LLM/agent.

If the host does **not** route `Escape` to `session_interrupt`, `/cancel-next-continuation` provides an explicit fallback entry point while the session is already idle.

If you need a fallback today, the practical options are:

1. run `/cancel-next-continuation`, or
2. ask the agent to call `cancel_next_continuation` for the current session.

In other words: if `Escape` does nothing after the agent has already gone idle, the missing piece is in the host/TUI event routing rather than this plugin's countdown timer.

## Local plugin loading

If you want to load the plugin from a local checkout instead of npm, build it first:

```bash
bun run build
```

Then place or link this repository under one of OpenCode's local plugin directories:

- `.opencode/plugins/`
- `~/.config/opencode/plugins/`

OpenCode will load the plugin manifest from `.claude-plugin/plugin.json` and then load `dist/index.js`.

The minimal manifest lives in `.claude-plugin/plugin.json`.

`bun run build` 會產生 `dist/index.js` 等建置產物；`.claude-plugin/plugin.json` 則提供 plugin loader 需要的基本中繼資料，讓 loader 從 repo root 讀取 manifest 後再載入 build 產物。

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Publish verification

```bash
bun run typecheck
bun test
npm pack --dry-run
npm publish --dry-run
```

## Verification checklist

- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run build`
- [ ] `opencode.json` 已加入 `todo-continuation-enforcer`
- [ ] 啟動有 unfinished todo 的 session
- [ ] 讓 session 進入 `session.idle`
- [ ] 確認會 inject continuation prompt
- [ ] 確認 latest assistant message 是 question 時不 inject
