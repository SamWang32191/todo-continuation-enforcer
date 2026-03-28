# todo-continuation-enforcer

Standalone OpenCode plugin that continues unfinished todos when a session becomes idle.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Local plugin loading

Build the plugin first:

```bash
bun run build
```

Then point your local OpenCode/OpenAgent plugin loader at this repository root so it can read `.claude-plugin/plugin.json` and load `dist/index.js`.

The minimal manifest lives in `.claude-plugin/plugin.json`.

`bun run build` 會產生 `dist/index.js` 等建置產物；`.claude-plugin/plugin.json` 則提供 plugin loader 需要的基本中繼資料，讓 loader 從 repo root 讀取 manifest 後再載入 build 產物。

## Verification checklist

- [ ] `bun run build`
- [ ] plugin loader 指向 repo root
- [ ] 啟動有 unfinished todo 的 session
- [ ] 讓 session 進入 `session.idle`
- [ ] 確認會 inject continuation prompt
- [ ] 確認 latest assistant message 是 question 時不 inject
