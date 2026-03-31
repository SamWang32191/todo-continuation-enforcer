---
id: release-workflow-publish-preflight
date: 2026-03-31
scope: project
tags: [github-actions, release, npm, trusted-publishing, git-push]
source: retrospective
confidence: 0.3
related: [[installed-package-plugin-smoke-test]]
---

# Preflight git push and isolate npm auth before trusted publishing

## Context
在為這個 repo 設計 GitHub Actions release workflow 時，正式發版順序採用 `publish -> atomic push -> gh release create`，以避免先推 `main` 後 npm publish 失敗造成主線進入未發布版本。

## Mistake
如果在 `npm publish` 前沒有先檢查 `git push` 是否可行，會在 publish 成功後才發現 branch protection、權限或 fast-forward 條件不成立，留下 partial release。若 trusted publishing 流程沒有明確隔離殘留 npm token 設定，也容易讓 OIDC / token auth 混用，增加維護風險。

## Lesson
- 正式 release 若採用 `publish -> push` 順序，必須先做 `git push --dry-run --atomic ...` preflight，確認 push 權限與 fast-forward 條件。
- trusted publishing workflow 應明確走 OIDC 路徑：清理 `NODE_AUTH_TOKEN` / `NPM_TOKEN`，使用乾淨的暫時 `NPM_CONFIG_USERCONFIG`，並對 repo-level `.npmrc` 的 auth token 設定 fail-fast。
- `npm pack --dry-run` 應在 release version 已寫入 `package.json` 後執行，才能驗證最終封包狀態。

## When to Apply
當 repo 要新增或調整 npm release workflow，且流程包含 GitHub Actions、trusted publishing / provenance、git tag 與 release commit 推送時使用。
