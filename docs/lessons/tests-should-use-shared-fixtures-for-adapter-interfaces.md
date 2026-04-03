---
id: tests-should-use-shared-fixtures-for-adapter-interfaces
date: 2026-04-03
scope: project
tags:
  - tests
  - fixtures
  - adapters
  - maintainability
source: retrospective
confidence: 0.3
related: []
---

# Tests should use shared fixtures for adapter interfaces

## Context

在調整 continuation prompt wrapper 測試時，單元測試一開始為多個 case 各自手寫 `SessionApi` stub。當 `SessionApi` 介面需要補上 `abort()` 時，測試檔內多處 stub 都要同步修補。

## Mistake

對同一個 adapter 介面反覆手寫測試 stub，會讓測試過度耦合介面細節；一旦介面擴充，許多不關心該欄位的測試也要一起修改。

## Lesson

當 repo 已有共用 fake / fixture 可以代表某個 adapter 介面時，測試應優先重用它；若沒有合適 helper，也至少在測試檔內抽一個本地 factory，而不是在每個 case 重新手寫完整 stub。

## When to Apply

新增或修改任何依賴 `SessionApi`、message store、logger、SDK client 等 adapter 介面的單元或整合測試時。
