# Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一個手動觸發的 GitHub Actions release workflow，安全驗證版本與 release 狀態後，支援 dry-run 預演與正式 npm / tag / GitHub Release 發布。

**Architecture:** 只新增 `.github/workflows/release.yml`。workflow 分成 `ensure-release-readiness` 與 `release` 兩個 jobs：前者處理版本與外部狀態檢查，後者處理 branch/head 驗證、建置驗證、local release state、npm publish、git push 與 GitHub Release。

**Tech Stack:** GitHub Actions YAML、Bash、Node.js（內嵌 version validation script）、Bun、npm、gh CLI

---

### Task 0: 確認 release 外部前置條件

**Files:**
- Reference: `package.json:1-48`
- Reference: `docs/superpowers/specs/2026-03-31-release-workflow-design.md`

- [ ] **Step 1: 確認 npm package 名稱與發佈可見性**

Run: `node -p "require('./package.json').name + ' ' + require('./package.json').version"`
Expected: 輸出 `todo-continuation-enforcer <current-version>`，且 package 將以 public package 發佈

- [ ] **Step 2: 確認 GitHub Actions 可推送到 main**

```text
在 GitHub repository settings / branch protection rules 中確認：
- workflow 使用的 GITHUB_TOKEN 沒有被 branch protection 擋下
- 若 main 要求 PR-only merge，需先確認是否有允許 GitHub Actions bypass，否則此 workflow 設計不能直接落地
```

- [ ] **Step 3: 確認 npm trusted publishing / provenance 已配置**

```text
在 npm package settings 中確認：
- package 已連結到這個 GitHub repository
- trusted publishing / OIDC 已啟用
- GitHub Actions 來源允許發佈這個 package
```

- [ ] **Step 4: 記錄前置條件檢查結果**

Run: `printf 'branch-protection=checked\nnpm-trusted-publishing=checked\n'`
Expected: 這兩個條件都已人工確認；若任一無法確認，停止 implementation

### Task 1: 建立 workflow 骨架與 readiness job

**Files:**
- Create: `.github/workflows/release.yml`
- Reference: `package.json:1-48`
- Reference: `docs/superpowers/specs/2026-03-31-release-workflow-design.md`

- [ ] **Step 1: 建立 workflow 檔案骨架**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: Release version (X.Y.Z)
        required: true
        type: string
      notes:
        description: Optional one-line release notes
        required: false
        type: string
      dry_run:
        description: Preview release without mutating remote state
        required: false
        type: boolean
        default: false

permissions:
  contents: write
  id-token: write

concurrency:
  group: ${{ github.workflow }}-main
  cancel-in-progress: false

jobs:
  ensure-release-readiness:
    runs-on: ubuntu-latest
    outputs:
      final_version: ${{ steps.validate-version.outputs.final_version }}
      package_name: ${{ steps.package-meta.outputs.package_name }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Read package metadata
        id: package-meta
        run: |
          echo "package_name=$(node -p \"require('./package.json').name\")" >> "$GITHUB_OUTPUT"
          echo "current_version=$(node -p \"require('./package.json').version\")" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: 加入嚴格 version 驗證**

```yaml
      - name: Validate release version
        id: validate-version
        env:
          INPUT_VERSION: ${{ inputs.version }}
          CURRENT_VERSION: ${{ steps.package-meta.outputs.current_version }}
        run: |
          node <<'EOF'
          const input = process.env.INPUT_VERSION ?? ''
          const current = process.env.CURRENT_VERSION ?? ''

          const semver = /^(\d+)\.(\d+)\.(\d+)$/
          if (!input) throw new Error('version input is required')
          if (input.startsWith('v')) throw new Error('version must not start with v')
          if (!semver.test(input)) throw new Error('version must match X.Y.Z')
          if (!semver.test(current)) throw new Error(`current package version is not strict semver: ${current}`)

          const toTuple = (value) => value.split('.').map((part) => Number(part))
          const [inMajor, inMinor, inPatch] = toTuple(input)
          const [curMajor, curMinor, curPatch] = toTuple(current)

          const isGreater =
            inMajor > curMajor ||
            (inMajor === curMajor && inMinor > curMinor) ||
            (inMajor === curMajor && inMinor === curMinor && inPatch > curPatch)

          if (!isGreater) {
            throw new Error(`version ${input} must be greater than current version ${current}`)
          }

          require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT, `final_version=${input}\n`)
          EOF
```

- [ ] **Step 3: 加入 tag / npm 狀態檢查與 partial release 阻擋**

```yaml
      - name: Check release state
        env:
          FINAL_VERSION: ${{ steps.validate-version.outputs.final_version }}
          PACKAGE_NAME: ${{ steps.package-meta.outputs.package_name }}
        run: |
          set -euo pipefail

          git fetch --force --tags origin

          TAG_EXISTS=false
          if git rev-parse --verify --quiet "refs/tags/v${FINAL_VERSION}" >/dev/null; then
            TAG_EXISTS=true
          fi

          NPM_EXISTS=false
          if npm view "${PACKAGE_NAME}@${FINAL_VERSION}" version --registry=https://registry.npmjs.org/ >/dev/null 2>&1; then
            NPM_EXISTS=true
          fi

          if [ "$TAG_EXISTS" = true ] && [ "$NPM_EXISTS" = true ]; then
            echo "Release v${FINAL_VERSION} already exists in git and npm"
            exit 1
          fi

          if [ "$TAG_EXISTS" = true ] || [ "$NPM_EXISTS" = true ]; then
            echo "Partial release detected for v${FINAL_VERSION}: tag=${TAG_EXISTS}, npm=${NPM_EXISTS}"
            exit 1
          fi
```

- [ ] **Step 4: 檢查 YAML 片段已寫入預期位置**

Run: `sed -n '1,120p' .github/workflows/release.yml`
Expected: 看得到 `workflow_dispatch`、`permissions`、`concurrency`、`ensure-release-readiness`

### Task 2: 加入 release job 的 branch/head 驗證與 local release state

**Files:**
- Modify: `.github/workflows/release.yml`
- Reference: `docs/superpowers/specs/2026-03-31-release-workflow-design.md`

- [ ] **Step 1: 加入 release job 與執行環境設定**

```yaml
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: ensure-release-readiness
    steps:
      - name: Guard dispatch branch is main
        run: |
          set -euo pipefail
          if [ "${GITHUB_REF_NAME}" != "main" ]; then
            echo "This workflow must be dispatched from main. Current ref: ${GITHUB_REF_NAME}"
            exit 1
          fi

      - name: Checkout dispatch SHA
        uses: actions/checkout@v5
        with:
          fetch-depth: 0
          ref: ${{ github.sha }}

      - name: Fetch main and tags
        run: |
          set -euo pipefail
          git fetch --force origin main
          git fetch --force --tags origin

      - name: Assert dispatch SHA is latest main HEAD
        run: |
          set -euo pipefail
          REMOTE_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"
          if [ "$REMOTE_MAIN_SHA" != "$GITHUB_SHA" ]; then
            echo "Workflow must run from latest origin/main. origin/main=${REMOTE_MAIN_SHA}, dispatch=${GITHUB_SHA}"
            exit 1
          fi

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.6

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org

      - name: Configure git author
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
```

- [ ] **Step 2: 加入固定驗證步驟**

```yaml
      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run typecheck
        run: bun run typecheck

      - name: Run tests
        run: bun test

      - name: Build package
        run: bun run build

      - name: Verify published package contents
        run: npm pack --dry-run
```

- [ ] **Step 3: 加入 version bump、release body、local commit 與 local tag**

```yaml
      - name: Bump package version without tagging
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: npm version "$FINAL_VERSION" --no-git-tag-version

      - name: Prepare release body
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
          RELEASE_NOTES: ${{ inputs.notes }}
          REPOSITORY: ${{ github.repository }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -euo pipefail
          {
            echo "# todo-continuation-enforcer v${FINAL_VERSION}"
            echo
            if [ -n "${RELEASE_NOTES}" ]; then
              echo "${RELEASE_NOTES}"
            else
              echo "Release created from ${GITHUB_SHA}."
              echo
              echo "Run: https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}"
            fi
          } > "$RUNNER_TEMP/release-body.md"

      - name: Create local release commit
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: |
          set -euo pipefail
          git add package.json
          git commit -m "chore: release v${FINAL_VERSION}"

      - name: Create local release tag
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: git tag "v${FINAL_VERSION}"
```

- [ ] **Step 4: 檢查 workflow 內容已包含 branch/head 驗證與 local release state**

Run: `sed -n '121,260p' .github/workflows/release.yml`
Expected: 看得到 `Assert dispatch SHA is latest main HEAD`、`npm pack --dry-run`、`Create local release commit`、`Create local release tag`

### Task 3: 加入正式發布步驟與本地驗證

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: 加入正式 publish / push / release 步驟**

```yaml
      - name: Publish to npm
        if: ${{ !inputs.dry_run }}
        run: |
          set -euo pipefail
          unset NODE_AUTH_TOKEN
          npm config delete //registry.npmjs.org/:_authToken || true
          rm -f ~/.npmrc .npmrc || true
          npm publish --provenance --access public --registry=https://registry.npmjs.org/

      - name: Push release commit and tag
        if: ${{ !inputs.dry_run }}
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: |
          set -euo pipefail
          git push --atomic origin HEAD:main "refs/tags/v${FINAL_VERSION}"

      - name: Create GitHub Release
        if: ${{ !inputs.dry_run }}
        env:
          GH_TOKEN: ${{ github.token }}
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: |
          set -euo pipefail
          gh release create "v${FINAL_VERSION}" \
            --repo "${{ github.repository }}" \
            --verify-tag \
            --notes-file "$RUNNER_TEMP/release-body.md"
```

- [ ] **Step 2: 加入 dry-run 語意註解，避免後續維護時破壞保證**

```yaml
      - name: Dry-run summary
        if: ${{ inputs.dry_run }}
        env:
          FINAL_VERSION: ${{ needs.ensure-release-readiness.outputs.final_version }}
        run: |
          echo "Dry run completed for v${FINAL_VERSION}. No remote state was mutated."
```

- [ ] **Step 3: 執行本地靜態檢查與 diff review**

Run: `git diff -- .github/workflows/release.yml`
Expected: 只看到 `.github/workflows/release.yml` 新增內容，且 workflow 結構對應 spec

- [ ] **Step 4: 執行 repo 驗證，確認 workflow 變更未破壞既有專案**

Run: `bun run typecheck && bun test && bun run build`
Expected: 全部成功

- [ ] **Step 5: 請求人工驗證點**

Run: `git status --short`
Expected: 至少看到 `.github/workflows/release.yml`，若同時更新 spec / plan 文件也應只包含這些預期檔案

**Checkpoint:** 檢查 workflow 是否滿足下列條件後再進 commit / PR：

```text
- version 驗證嚴格且禁止 v 前綴
- readiness job 同時檢查 git tag 與 npm version
- partial release 會 fail
- release job 驗證 dispatch SHA 是最新 origin/main
- dry_run 不會 push / publish / create release
- 正式發布順序為 publish -> 單一 push commit+tag -> gh release create --verify-tag
```

### Task 4: 補上 workflow 驗收 runbook

**Files:**
- Modify: `.github/workflows/release.yml`
- Reference: `docs/superpowers/specs/2026-03-31-release-workflow-design.md`

- [ ] **Step 1: 定義 dry-run 成功案例的驗收方式**

```text
在 PR 說明或驗收筆記中加入：
- 以 Actions UI 手動觸發 `dry_run=true`
- 使用一個不存在、且大於目前 package.json version 的測試版本
- 預期：workflow 跑完 validation、version bump、local commit/tag、dry-run summary
- 預期：沒有 `npm publish`、`git push`、`gh release create` 被執行
```

- [ ] **Step 2: 定義 non-main dispatch 失敗案例**

```text
驗收方式：
- 從非 main branch 開啟 workflow_dispatch
- 預期在 `Guard dispatch branch is main` 失敗
```

- [ ] **Step 3: 定義 stale origin/main SHA 失敗案例**

```text
驗收方式：
- 從 main 的非最新 commit 觸發 workflow_dispatch
- 預期在 `Assert dispatch SHA is latest main HEAD` 失敗
```

- [ ] **Step 4: 定義 partial release 偵測案例**

```text
驗收方式：
- 模擬 tag 已存在但 npm version 不存在，或 npm version 已存在但 tag 不存在
- 預期在 `Check release state` 失敗，並顯示 partial release 訊息
```

- [ ] **Step 5: 定義正式 release 路徑驗收點**

```text
正式 release 驗收至少確認：
- `npm publish --provenance --access public` 成功
- `git push --atomic origin HEAD:main refs/tags/vX.Y.Z` 成功
- `gh release create vX.Y.Z --verify-tag` 成功
- main 上存在對應 `chore: release vX.Y.Z` commit
- remote tag 與 GitHub Release 都存在
```
