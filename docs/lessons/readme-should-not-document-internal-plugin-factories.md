---
id: readme-should-not-document-internal-plugin-factories
date: 2026-04-02
scope: project
tags: [readme, docs, plugin, api, exports]
source: retrospective
confidence: 0.3
related: []
---

# README 不要把內部 plugin factory 寫成公開 API

## Context
在調整這個 repo 的 countdown 預設值文件時，需要補充 `countdownSeconds` 可覆寫的說明。

## Mistake
如果 README 直接示範 repo 內部的 `createPlugin({ countdownSeconds })` factory，用 npm 安裝的使用者會誤以為那是套件正式匯出的公開 API。

## Lesson
- README 的使用範例必須對齊 `package.json` exports 與實際公開入口。
- 若某個設定只存在 source/internals 層級，文件要明確標示語境，或改成純文字說明，不要提供像公開 API 的可直接照抄範例。
- 在補文件前，先核對 `src/index.ts` 與 `package.json` 的對外匯出，避免文件先於 API 漂移。

## When to Apply
當這個 repo 或其他 plugin/package repo 要新增 README 使用範例、設定覆寫方式、或程式化接入說明時。
