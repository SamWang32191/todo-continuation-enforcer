# npm Publish Prep Design

## Summary

針對 `todo-continuation-enforcer` 完成首次公開發佈到 npmjs 前的前置整理，讓 repo 進入「執行 `npm publish` 前只需最後人工確認」的狀態。

## Goals

- 補齊 npm package 的必要與建議 metadata
- 確保 publish / pack 前自動建置，避免漏出 `dist/`
- 明確控制實際發佈檔案內容
- 更新 README，使 npm 頁面具備基本安裝與使用說明
- 用 dry-run 驗證目前可正常打包並模擬發佈

## Non-Goals

- 不實際執行 `npm publish`
- 不新增 plugin 功能或改變 continuation 行為
- 不做額外 release automation、CI/CD、changelog 系統
- 不處理 npm 套件名稱策略以外的品牌調整

## Chosen Approach

採用「完整上架前準備」方案：

1. 直接在現有 repo 補齊 npm metadata
2. 以 `prepack` 保證 `npm pack` / `npm publish` 前會先產生 `dist/`
3. 保持 `files` 白名單策略，只發出 build 與 plugin manifest 所需檔案
4. 在 README 增加 npm 消費者視角的最小資訊
5. 用 `typecheck`、`test`、`build`、`npm pack --dry-run`、`npm publish --dry-run` 做發佈前驗證

## Package Metadata Plan

`package.json` 需要具備：

- `license: "MIT"`
- `repository` 指向 GitHub repo
- `homepage` 指向 GitHub repo README
- `bugs` 指向 GitHub issues
- `keywords` 提供最小搜尋語意

保留現有：

- `name`
- `version`
- `type`
- `main`
- `types`
- `exports`
- `files`

## Build and Publish Guardrails

加入 `prepack` script，內容為執行既有 build script。

目的：

- `npm pack` 前自動建置
- `npm publish` 前自動建置
- 降低人工忘記先跑 `bun run build` 的風險

不額外加入複雜 publish script，避免把簡單發佈流程過度包裝。

## Publish Surface

預期發佈內容維持為：

- `dist/**`
- `.claude-plugin/**`
- npm 自動包含的必要 metadata 檔案（如 `package.json`、`README.md`）

若 `npm pack --dry-run` 顯示不必要檔案被納入，再補 `.npmignore`；若白名單已足夠，則不額外新增 `.npmignore`。

## README Updates

README 需至少包含：

- 套件用途簡述
- 安裝方式
- 本地或宿主載入的基本使用說明
- 開發 / build 指令
- 發佈前驗證提示（可簡短）

README 目標是讓 npm 頁面上的第一次訪客知道：這是什麼、怎麼安裝、如何在 OpenCode 中載入。

## Verification Plan

正式前置完成的驗證步驟：

1. `bun run typecheck`
2. `bun test`
3. `bun run build`
4. `npm pack --dry-run`
5. `npm publish --dry-run`

成功標準：

- 沒有型別錯誤
- 測試通過
- build 成功
- dry-run 顯示的 tarball 內容符合預期
- 模擬 publish 不因 metadata / access / 打包缺失而失敗

## Risks and Handling

- **套件名衝突**：若名稱已存在，需先改名再發佈
- **build 產物缺漏**：用 `prepack` 降低風險
- **README 資訊不足**：補最小安裝與使用段落
- **多發不必要檔案**：以 `files` 與 dry-run 結果調整
- **誤把此階段當正式發佈**：明確只做到 dry-run，不執行真實 publish
