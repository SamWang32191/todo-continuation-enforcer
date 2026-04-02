---
id: exact-output-tests-should-use-literal-expected-strings
date: 2026-04-03
scope: project
tags:
  - tests
  - prompts
  - regression
  - readability
source: retrospective
confidence: 0.3
related:
  - [[prompt-integration-tests-should-reference-exported-constants]]
---

# Exact output tests should use literal expected strings

## Context

在重構 prompt 字串組裝可讀性時，測試一度也改成用 `join("\n")` / `join("\n\n")` 重新拼出 expected string，結果讓測試結構開始映照實作結構。

## Mistake

當目標是保護「最終輸出完全不變」這種 contract 時，測試卻用和實作相似的組裝方式建立 expected value，會削弱回歸保護，讓結構性錯誤更難被抓到。

## Lesson

如果測試要驗證最終輸出字串的精確內容，expected value 應優先寫成清楚的 literal string，而不是重新用同類型的 `join()` / template 結構去組裝它。

## When to Apply

當你在重構 prompt、system directive、CLI 輸出或任何以字串格式為主要 contract 的程式碼，而且測試目標是保證輸出逐字不變時。
