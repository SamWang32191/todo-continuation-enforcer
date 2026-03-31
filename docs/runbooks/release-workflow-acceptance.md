# Release Workflow Acceptance Runbook

此 runbook 用來驗收 `.github/workflows/release.yml` 的主要路徑與失敗保護。

## 共通檢查

- workflow 觸發方式：`workflow_dispatch`
- 關鍵順序：`publish -> atomic push -> gh release create`
- release 內容準備順序：先更新 `package.json` version，再 `npm pack --dry-run`，再產生 release body
- 驗收時請保留 GitHub Actions run URL 與 logs 作為證據

## 1) dry-run 成功案例

**前置條件**
- 在 `main` 的最新 HEAD 上觸發
- `version` 大於目前 `package.json` version，且該版本目前不存在於 git tag / npm registry
- `dry_run=true`

**操作方式**
1. 手動 dispatch workflow。
2. 填入 `version` 與可選 `notes`。
3. 確認 run 完成。

**預期結果**
- readiness 檢查通過。
- 會執行 install / typecheck / test / build / `npm pack --dry-run`。
- 只會在 runner 本地更新 version、執行 `npm pack --dry-run`、建立 local commit/tag、產生 release body。
- 會看到 `Dry-run summary` step 成功輸出。
- 不會執行 npm publish、git push、`gh release create`。
- 遠端 repo、npm registry、GitHub Releases 都沒有變更。

## 2) non-main dispatch 失敗案例

**前置條件**
- 從非 `main` 分支手動觸發 workflow。

**操作方式**
1. 在任一非 `main` 分支的 commit 上 dispatch。
2. 觀察 `release` job。

**預期結果**
- `release` job 在 branch guard 直接失敗。
- 訊息明確指出只能從 `main` dispatch。
- 不會進入 install / test / build / publish / push / release 流程。

## 3) stale origin/main SHA 失敗案例

**前置條件**
- 只在 sandbox / test repo 驗證。
- repo 的 `main` 先準備兩個連續 commits：`old_sha` 與 `new_sha`。

**操作方式**
1. 先把 `old_sha` 推到 `main` 並手動 dispatch workflow。
2. 再把 `new_sha` 推到 `main`，讓 `origin/main` 前進到較新的 commit。
3. 等 workflow 跑到 `Assert dispatch SHA is latest main HEAD`。
4. 若 workflow 太快通過 SHA guard，視為 timing-sensitive 測試未成功建立，應在可控制節奏的 sandbox / test repo 重試。

**預期結果**
- job 失敗於 HEAD 比對步驟。
- log 顯示 `origin/main` SHA 與 dispatch SHA 不一致，且 dispatch SHA 為較舊的 `old_sha`。
- 不會執行後續建置與 release 動作。

## 4) partial release 偵測案例

**前置條件**
- 僅限 sandbox repo / 測試 package / fork 驗證。
- 必須確認目標版本不會污染正式 npm package 或正式 tag。
- 建議使用暫時 namespace、測試 package name，或可完整清理的 fork 環境。
- 目標版本已滿足「只存在 tag 或只存在 npm 版本其中一方」的狀態。
- 例如：已存在 `vX.Y.Z` tag，但 npm 尚未有 `${package}@X.Y.Z`；或反過來。

**操作方式**
1. 在 sandbox/fork 中先人工建立其中一個狀態（只打 tag 或只發布 npm 版本）。
2. 手動 dispatch 同一個 `version`。
3. 觀察 `ensure-release-readiness` job。

**預期結果**
- workflow 在 readiness 階段的 `Check release state` step 直接失敗。
- log 明確指出 `Partial release detected`。
- 不會進入 release job。

## 5) 正式 release 路徑驗收點

**前置條件**
- `main` 最新 HEAD
- `version` 合法且大於目前版本
- `vX.Y.Z` tag 與 npm version 都不存在
- `dry_run=false`

**操作方式**
1. 手動 dispatch workflow。
2. 驗證完整 run logs。

**預期結果**
- readiness job 通過。
- release job 關鍵步驟至少包含：
  1. branch / HEAD preflight gate
  2. install / typecheck / test / build
  3. 更新 `package.json` version
  4. `npm pack --dry-run`
  5. release body preparation
  6. 建立 `chore: release vX.Y.Z` release commit
  7. 建立 local tag
  8. preflight release push (`git push --dry-run --atomic ...`)
  9. `npm publish --provenance --access public`
  10. 單一 atomic push 到 `origin`（commit + tag）
  11. `gh release create vX.Y.Z --verify-tag`
- 必須在 main 上驗證到 `chore: release vX.Y.Z` release commit 已存在。
- 最終可在 GitHub Releases、remote tag、npm registry 看到同一版本。
