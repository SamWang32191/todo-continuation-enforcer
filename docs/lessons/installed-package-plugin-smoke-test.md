---
id: installed-package-plugin-smoke-test
date: 2026-03-28
scope: project
tags: [opencode, plugin, npm-pack, smoke-test, publish]
source: bug-fix
confidence: 0.5
related: [[local-opencode-plugin-smoke-test]]
---

# Smoke-test the installed tarball, not just the repo build output

## Context
在 npm publish 前置驗證中，只確認 repo 內的 `dist/index.js` 可被 `opencode` 載入，仍不足以證明「打包後、安裝到 `node_modules` 的產物」真的能被 host 載入。

## Mistake
如果只做 repo-local smoke test，會漏掉 tarball 安裝後檔案結構、manifest 與 entrypoint 是否仍正確的風險。第一次重跑驗證時，還因為把設定檔寫在錯誤位置而得到不可靠的結論。

## Lesson
- 在 publish 前，先用 `npm pack` 產生 tarball，再安裝到 throwaway 目錄的 `node_modules`。
- 確認安裝後 package 內仍有 `.claude-plugin/plugin.json` 與 `dist/index.js`。
- 用暫時的 `$XDG_CONFIG_HOME/opencode/opencode.json` 設定 `"plugin": ["file:///absolute/path/to/node_modules/<pkg>/dist/index.js"]`，再執行 `opencode run --print-logs --log-level DEBUG ...`。
- 以日誌中的 `service=plugin path=file:///.../node_modules/<pkg>/dist/index.js loading plugin` 當作已安裝 tarball 可被 host 載入的證據。

## When to Apply
當這個 repo 或其他 OpenCode plugin repo 準備 npm publish，且你要驗證「已打包並安裝後的實際產物」是否仍能被 host 載入時使用。
