# Release Workflow Design

**Date:** 2026-03-31

## Goal

為 `todo-continuation-enforcer` 新增一個可手動觸發的 GitHub Actions release workflow，參考 `oh-my-opencode-medium/.github/workflows/release.yml` 的安全檢查與完整發版骨架，但改造成符合本 repo 的精簡版本：驗證專案、檢查版本/tag/npm 狀態、發佈 npm、建立 git tag、建立 GitHub Release。

## Current Context

- 本 repo 目前沒有 `.github/workflows/`。
- `package.json` 已具備 `build`、`prepack`、`typecheck`、`test` scripts，可直接被 workflow 使用。
- 目前 `package.json` 版本是 `0.1.0`。
- 預設分支目前是 `main`，不是參考 repo 的 `medium`。
- 本 repo 沒有 `lint` script，也沒有 `scripts/release-ci.ts` 這種自訂 release helper。
- 本 repo 已經有 npm publish 準備相關設計與 lesson，代表 release 前值得加一個 package 產物檢查步驟。

## Reference Input

參考檔案：`/Users/samwang/Repo/oh-my-opencode-medium/.github/workflows/release.yml`

保留的核心概念：

- `workflow_dispatch` 手動觸發
- 先決定 release version，再檢查 release 狀態是否已存在
- 發版前先跑驗證
- 使用 `npm publish --provenance --access public`
- 發版完成後 push tag 並建立 GitHub Release

不沿用的部分：

- `medium` 分支限制，改為 `main`
- `auto-bump` job
- `lint` 步驟
- `scripts/release-ci.ts`
- upstream remote 專屬設定

## Chosen Approach

採用「**手動輸入版本的完整發版 workflow**」。

### Why this approach

- 對這個 repo 最小且足夠：不需要額外 release script。
- 仍保有完整保護：版本驗證、release 狀態檢查、branch/head 驗證、dry-run。
- 操作方式清楚：每次 release 明確輸入版本號，避免 workflow 幫忙推算版本造成額外複雜度。
- 明確定義 partial failure 行為，避免實作者自行腦補發版順序。

## Workflow Behavior

### Trigger

- `on.workflow_dispatch`

### Inputs

- `version`：字串，必填，必須是嚴格 semver `X.Y.Z`
- `notes`：字串，選填，用於 GitHub Release 文字
- `dry_run`：布林，預設 `false`

### Version Rules

- `version` 不可為空
- `version` 不可帶 `v` 前綴
- `version` 必須符合嚴格 semver `X.Y.Z`
- `version` 必須大於目前 `package.json` 的 version

若任一條件不成立，workflow 直接失敗。

### Permissions

- `contents: write`
- `id-token: write`

`contents: write` 用於 push commit/tag 與建立 GitHub Release；`id-token: write` 用於 npm provenance publish。

### Concurrency

- 以 workflow 名稱加上 `main` 作為 concurrency group
- `cancel-in-progress: false`

避免同 repo 同時跑兩個正式 release。

## Job Structure

### 1. ensure-release-readiness

責任：

- checkout full history 與 tags
- 驗證 `version` input
- 讀取目前 `package.json` version 並檢查輸入版本是否更大
- 檢查 `v${version}` tag 是否已存在
- 檢查 npm registry 上 `${packageName}@${version}` 是否已存在
- 將最終版本輸出為 job output

### Release State Rules

workflow 需要明確區分三種狀態：

1. **tag 不存在、npm 版本不存在**：可繼續
2. **tag 與 npm 版本都存在**：視為已完成 release，直接 fail
3. **只存在其中一個**：視為不一致 partial release，直接 fail，要求人工修復後再重跑

這比只檢查 tag 更安全，能正確處理 rerun 與 failure recovery。

### 2. release

責任：

- 僅允許從 `main` dispatch
- checkout with full history at `github.sha`
- fetch `origin/main` 與 tags
- 驗證 dispatch SHA 就是目前 `origin/main` head
- setup Bun 與 Node/npm registry
- 安裝依賴
- 設定 git author
- 執行：
  - `bun install --frozen-lockfile`
  - `bun run typecheck`
  - `bun test`
  - `bun run build`
- 將 `package.json` version 設為輸入版本
- 執行 `npm pack --dry-run`
- 組出 release notes 檔
- 建立 release commit：`chore: release vX.Y.Z`
- 建立 local tag：`vX.Y.Z`
- 非 dry-run 時：
  - 清理 `NODE_AUTH_TOKEN` / `NPM_TOKEN`，並對 repo-level `.npmrc` 的 auth token 設定 fail-fast
  - `npm publish --provenance --access public --registry=https://registry.npmjs.org/`
- 以單一 atomic push 將 release commit 與 tag 一起推到 `origin`
  - `gh release create vX.Y.Z --verify-tag`

## Release Order

非 dry-run 的精確順序如下：

1. 驗證 branch / HEAD / version / release state
2. 跑 install / typecheck / test / build
3. 以 no-lifecycle 方式更新 `package.json` version
4. 執行 `npm pack --dry-run`
5. 建立 release body
6. 建立 local release commit
7. 建立 local tag
8. 執行 `npm publish --provenance --access public --registry=https://registry.npmjs.org/`
9. 執行單一 `git push --atomic origin HEAD:main refs/tags/vX.Y.Z`
10. 執行 `gh release create vX.Y.Z --verify-tag --notes-file ...`

### Why this order

- `npm publish` 前先建立 local commit/tag，可確保發布內容對應到明確的 git 狀態。
- 先 publish、再 push commit/tag，雖然仍非交易式，但比「先推 main、publish 失敗」更能避免主線進入未發布版本。
- commit 與 tag 一起 atomic push，可減少「commit 已推但 tag 未推」的中間狀態。
- `npm pack --dry-run` 必須放在 version bump 後，才能驗證最終 release version 的封包內容。

## Partial Failure / Recovery Policy

這個 workflow **不支援自動 resume**。若非 dry-run 過程中失敗，採用以下規則：

- **npm publish 失敗**：停止，不 push commit/tag，不建立 GitHub Release
- **npm publish 成功，但 git push 失敗**：停止；下次 rerun 會因 npm version 已存在、tag 不存在而被 readiness job 阻擋。需人工確認後推送相符 commit/tag，或依 npm 政策處理已發布版本。
- **git push 成功，但 GitHub Release 建立失敗**：停止；下次 rerun 會因 tag 與 npm version 都已存在而被視為已發布。應直接人工建立 GitHub Release，而不是重跑 workflow。

這讓 workflow 的失敗模式明確、可預期，也避免重跑時在未知狀態繼續 mutate。

## Release Notes Strategy

不新增 `scripts/release-ci.ts`。改由 workflow 直接產生臨時 release body 檔：

- 若 `notes` 有值，body 至少包含版本與這行 notes
- 若 `notes` 為空，body 至少包含版本、commit SHA 與 GitHub Actions run URL

這樣可避免把簡單 repo 的 release 流程拉高到需要維護額外腳本。

## Branch Policy

- workflow 必須從 `main` branch dispatch
- 若從其他 branch 觸發，直接 fail
- workflow 必須確認 `github.sha` 等於當下 `origin/main` 的 head；若不是最新主線，直接 fail

理由：release workflow 應只從穩定主線的最新 commit 發版，而不是從舊的 `main` commit 預約式發版。

## Git Mutation Policy

workflow 會修改 repo 內容，但只限 release 所需最小範圍：

- 更新 `package.json` version
- 建立一個 release commit
- 建立與推送 tag

不額外改 README、lockfile、changelog 或 docs。

## Validation Policy

release 前固定執行：

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun test`
- `bun run build`
- `npm pack --dry-run`（在 `package.json` version 更新後執行）

不加入 `lint`，因為目前 repo 未提供對應 script。

`npm pack --dry-run` 是額外的 package 產物驗證，避免只有 repo build 成功、但 publish 內容仍有落差。

## Dry Run Semantics

`dry_run: true` 時仍需：

- 驗證版本規則與 release state
- 跑 install/typecheck/test/build
- 在 runner 上更新 `package.json` version
- 執行 `npm pack --dry-run`
- 在 runner 上建立 local release commit、local tag 與 release body

但不得：

- push commit
- publish npm
- push tag
- create GitHub Release

這讓 workflow 能用來預演完整發版邏輯，而不改動遠端狀態。

## Security / Environment Assumptions

- 使用 GitHub 提供的 `github.token` 建立 release 與 push 內容
- repository 的 branch protection 必須允許 workflow 使用 `GITHUB_TOKEN` push 到 `main`，否則此設計無法運作
- npm 端必須已配置 trusted publishing / provenance，讓 GitHub Actions OIDC 能發布到 npm
- workflow 內會先清理 `NODE_AUTH_TOKEN` / `NPM_TOKEN`，並對 repo-level `.npmrc` 的 auth token 設定 fail-fast，再執行 publish，降低 runner 憑證干擾
- Bun 與 Node 版本固定為明確版本，而不是 `latest`

## Files To Add Or Modify

### Add

- `.github/workflows/release.yml`

### Modify

- 無必須修改；workflow 直接使用現有 `package.json` scripts

## Error Handling

- `version` 缺失、格式錯誤、帶 `v` 前綴、未大於當前版本：直接 fail
- tag 與 npm version 都已存在：直接 fail，視為已發布
- tag / npm version 僅一方存在：直接 fail，視為 partial release
- 非 `main` 觸發：直接 fail
- dispatch SHA 不是 `origin/main` 最新 head：直接 fail
- 驗證命令失敗：直接 fail，不做任何 publish/release
- `npm publish` 失敗：workflow fail，不 push commit/tag，也不建立 GitHub Release
- `gh release create` 失敗：workflow fail，但不回滾已推送的 commit/tag 或已發布的 npm package

## Testing Strategy

實作後應驗證：

1. YAML 結構合理，inputs / jobs / permissions / concurrency 正確
2. readiness job 會正確區分「未發布 / 已發布 / partial release」三種狀態
3. `dry_run: true` 時只跑驗證與本地 release 準備步驟
4. `dry_run: false` 時具備 publish / 單一 push commit+tag / GitHub Release 路徑
5. 從非 `main` branch dispatch 時會失敗
6. 從不是 `origin/main` 最新 head 的 commit dispatch 時會失敗

## Out of Scope

- 自動 bump patch/minor version
- 自動產生 changelog
- 依 PR/commit 自動聚合 release note
- 自動從 tag push 觸發 release
- CI workflow 或 contributors workflow
- 自動 resume partial release

## Success Criteria

- repo 新增一個可讀、可維護的 `.github/workflows/release.yml`
- workflow 結構明顯對應本 repo，而不是硬拷貝參考 repo 的 repo-specific 細節
- 支援完整發版與 dry-run 預演
- 發版前固定執行 typecheck/test/build/`npm pack --dry-run`
- 能正確阻擋版本格式錯誤、重複 release 與 partial release
- 能安全建立 npm release 與 GitHub Release
