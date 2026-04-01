---
id: release-workflow-mutually-exclusive-inputs
date: 2026-04-01
scope: project
tags: [github-actions, release, workflow-dispatch, validation, inputs]
source: bug-fix
confidence: 0.5
related: [[release-workflow-publish-preflight]]
---

# Reject conflicting workflow_dispatch inputs explicitly

## Context
在 release workflow 新增可選的 `auto-bump` 後，流程同時支援自動遞增與手動輸入版本。

## Mistake
如果只用 `autoBumpVersion || inputVersion` 決定最終版本，當使用者同時提供兩個輸入時，workflow 會靜默忽略其中一個值，留下操作歧義。

## Lesson
- 對 `workflow_dispatch` 的互斥輸入，不要只靠優先順序隱式決定；應在正式執行前顯式報錯。
- 當 workflow 同時支援自動模式與手動模式時，至少要驗證三種情況：只有自動、只有手動、兩者都填。
- 若 UI 層無法表達條件必填或互斥關係，runtime validation 必須補上明確錯誤訊息。

## When to Apply
當 GitHub Actions workflow 新增 `workflow_dispatch` 輸入，且不同輸入會控制同一個最終參數或狀態時使用。
