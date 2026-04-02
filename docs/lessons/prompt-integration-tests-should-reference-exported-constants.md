---
id: prompt-integration-tests-should-reference-exported-constants
date: 2026-04-03
scope: project
tags:
  - tests
  - prompts
  - constants
  - regression
source: bug-fix
confidence: 0.5
related: []
---

# Prompt integration tests should reference exported constants

## Context

`CONTINUATION_PROMPT` 文案被更新以更明確要求使用 QUESTION TOOL，但一個整合測試仍硬編碼舊字串，導致只有該測試失敗。

## Mistake

在整合測試中重複驗證共享 prompt 的精確文案，而不是引用已匯出的常數，讓測試和產品行為分別演化。

## Lesson

當系統已有單元測試專門覆蓋共享 prompt 常數時，整合測試應引用該匯出的常數或只驗證整合層責任，避免因文案同步失敗產生假性回歸。

## When to Apply

新增或修改任何會被多處測試驗證的共享 prompt、system directive、toast 文案或常數時。
