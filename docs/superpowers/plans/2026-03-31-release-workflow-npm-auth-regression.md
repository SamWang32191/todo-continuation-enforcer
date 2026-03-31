# Release Workflow Npm Auth Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 release workflow 的 npm trusted publishing shell 邏輯，避免 `Publish to npm` 因 `ENEEDAUTH` 回歸失敗。

**Architecture:** 只修改 `.github/workflows/release.yml` 與對應 regression test。workflow 會從「覆寫 `NPM_CONFIG_USERCONFIG`」改成「清理 npm auth 狀態後直接 `npm publish --provenance`」；測試則直接鎖定 publish step 的 shell 內容，避免未來再引入同型回歸。

**Tech Stack:** GitHub Actions YAML、Bash、Bun test、TypeScript

---

### Task 1: 先寫失敗中的 workflow regression test

**Files:**
- Modify: `tests/unit/release-workflow-regression.test.ts`
- Reference: `.github/workflows/release.yml:255-267`
- Reference: `docs/superpowers/specs/2026-03-31-release-workflow-npm-auth-regression-design.md`

- [ ] **Step 1: 在 test 檔加入新的 failing test，描述 publish step 應清理 auth 而不是覆寫 userconfig**

```ts
  it("Publish to npm step 會清理 npm auth 狀態且不覆寫 userconfig", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Publish to npm")

    expect(runBlock).toContain("unset NODE_AUTH_TOKEN NPM_TOKEN")
    expect(runBlock).toContain("npm config delete //registry.npmjs.org/:_authToken || true")
    expect(runBlock).toContain("rm -f ~/.npmrc .npmrc || true")
    expect(runBlock).toContain("npm publish --provenance --access public --registry=https://registry.npmjs.org/")
    expect(runBlock).not.toContain("NPM_CONFIG_USERCONFIG")
    expect(runBlock).not.toContain("npm_config_userconfig")
  })
```

- [ ] **Step 2: 只跑這個新 test，確認它先失敗**

Run: `bun test tests/unit/release-workflow-regression.test.ts --test-name-pattern "Publish to npm step"`
Expected: FAIL，原因是目前 workflow 仍包含 `NPM_CONFIG_USERCONFIG`，且缺少 `npm config delete //registry.npmjs.org/:_authToken || true` 與 `rm -f ~/.npmrc .npmrc || true`

- [ ] **Step 3: 確認既有 metadata regression test 仍保留**

```ts
describe("release workflow regressions", () => {
  it("Read package metadata step 能成功寫出 package metadata", () => {
    // existing test kept as-is
  })

  it("Publish to npm step 會清理 npm auth 狀態且不覆寫 userconfig", () => {
    // new assertions from Step 1
  })
})
```

- [ ] **Step 4: 再跑整個 regression test 檔，確認只有新測試在紅燈**

Run: `bun test tests/unit/release-workflow-regression.test.ts`
Expected: 既有 `Read package metadata...` PASS；新的 `Publish to npm step...` FAIL

### Task 2: 最小修改 workflow 的 Publish to npm step

**Files:**
- Modify: `.github/workflows/release.yml`
- Test: `tests/unit/release-workflow-regression.test.ts`
- Reference: `/Users/samwang/Repo/oh-my-opencode-medium/.github/workflows/release.yml:183-190`

- [ ] **Step 1: 把 Publish to npm step 改成參考 repo 的清理模式**

```yaml
      - name: Publish to npm
        if: ${{ !inputs.dry_run }}
        run: |
          set -euo pipefail
          unset NODE_AUTH_TOKEN NPM_TOKEN
          unset NPM_CONFIG_USERCONFIG npm_config_userconfig
          npm config delete //registry.npmjs.org/:_authToken || true
          rm -f ~/.npmrc .npmrc || true
          npm publish --provenance --access public --registry=https://registry.npmjs.org/
```

- [ ] **Step 2: 確認舊的 userconfig 邏輯已完全移除**

Run: `rg -n "auth token settings in repo-level \.npmrc|NPM_CONFIG_USERCONFIG=|npm_config_userconfig=" .github/workflows/release.yml`
Expected: 沒有任何輸出；只允許 `unset NPM_CONFIG_USERCONFIG npm_config_userconfig`

- [ ] **Step 3: 重新跑剛才紅燈的單一 regression test，確認轉綠**

Run: `bun test tests/unit/release-workflow-regression.test.ts --test-name-pattern "Publish to npm step"`
Expected: PASS

- [ ] **Step 4: 跑完整 regression test 檔，確認兩個測試都綠燈**

Run: `bun test tests/unit/release-workflow-regression.test.ts`
Expected: PASS，`2 pass`

### Task 3: 驗證 workflow 與 runbook 需求仍一致

**Files:**
- Reference: `.github/workflows/release.yml`
- Reference: `docs/runbooks/release-workflow-acceptance.md:82-109`

- [ ] **Step 1: 確認正式 release 路徑仍保留 provenance publish 指令**

Run: `rg -n "npm publish --provenance --access public" .github/workflows/release.yml docs/runbooks/release-workflow-acceptance.md`
Expected: 兩個檔案都能找到這段指令

- [ ] **Step 2: 確認 release 順序沒有被這次修正改壞**

Run: `rg -n "Preflight release push|Publish to npm|Push release commit and tag|Create GitHub Release" .github/workflows/release.yml`
Expected: 仍可看出順序是 preflight push -> publish -> push commit+tag -> GitHub release

- [ ] **Step 3: 跑一次完整單元測試檔，作為本次改動的最小驗證證據**

Run: `bun test tests/unit/release-workflow-regression.test.ts`
Expected: PASS，沒有失敗測試

- [ ] **Step 4: 檢查 git diff，只應包含 workflow 與 regression test（若有必要的 plan/spec 追蹤檔案除外）**

Run: `git diff -- .github/workflows/release.yml tests/unit/release-workflow-regression.test.ts docs/superpowers/specs/2026-03-31-release-workflow-npm-auth-regression-design.md docs/superpowers/plans/2026-03-31-release-workflow-npm-auth-regression.md`
Expected: diff 聚焦在 publish shell 邏輯與新 regression test
