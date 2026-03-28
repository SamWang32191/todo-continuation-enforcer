# npm Publish Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `todo-continuation-enforcer` 進入可安全執行首次 `npm publish` 的前置完成狀態，但不實際發佈。

**Architecture:** 這次工作只調整發佈邊界，不改 plugin runtime 行為。主要修改 `package.json` 來補齊 registry metadata 與 `prepack` 保護、更新 `README.md` 讓 npm 頁面可用，再用 `bun` 與 `npm` dry-run 驗證實際發佈內容。

**Tech Stack:** TypeScript, Bun, npm, Markdown

---

## File Structure

### Files to Modify

- `package.json` - 補齊 npm metadata、加入 `prepack`
- `README.md` - 補 npm 安裝/使用說明與 publish 驗證提示

### Files to Create

- `docs/superpowers/specs/2026-03-28-npm-publish-prep-design.md` - 已核准設計
- `docs/superpowers/plans/2026-03-28-npm-publish-prep.md` - 本 implementation plan

### Verification Commands

- `bun run typecheck`
- `bun test`
- `bun run build`
- `npm view todo-continuation-enforcer`
- `npm pack --dry-run`
- `npm publish --dry-run`

## Task 1: 補齊 package metadata 與 prepack 保護

**Files:**
- Modify: `package.json`
- Test: `npm pack --dry-run`

- [ ] **Step 1: 先讓 package metadata 具備 npm 公開頁面所需欄位**

將 `package.json` 補成至少包含以下欄位：

```json
{
  "name": "todo-continuation-enforcer",
  "version": "0.1.0",
  "description": "Standalone OpenCode plugin that continues unfinished todos on session idle.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SamWang32191/todo-continuation-enforcer.git"
  },
  "homepage": "https://github.com/SamWang32191/todo-continuation-enforcer#readme",
  "bugs": {
    "url": "https://github.com/SamWang32191/todo-continuation-enforcer/issues"
  },
  "keywords": [
    "opencode",
    "plugin",
    "todo",
    "agent",
    "continuation"
  ]
}
```

- [ ] **Step 2: 加入 `prepack`，避免 pack/publish 前忘記 build**

在 `scripts` 內加入：

```json
{
  "scripts": {
    "build": "rm -rf dist && bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "prepack": "bun run build",
    "typecheck": "tsc -p tsconfig.typecheck.json",
    "test": "bun test"
  }
}
```

- [ ] **Step 3: 保持目前 publish surface 簡潔，不額外擴大 `files`**

確認保留：

```json
{
  "files": [
    "dist",
    ".claude-plugin"
  ]
}
```

不要把 `src`、`tests`、`docs` 加進 `files`。

- [ ] **Step 4: 驗證 metadata 與 pack 邊界**

Run: `npm pack --dry-run`

Expected:
- tarball 會包含 `dist/**`
- tarball 會包含 `.claude-plugin/**`
- tarball 會包含 `package.json` 與 `README.md`
- tarball 不會把 `src/`、`tests/`、`docs/` 全部打進去

## Task 2: 更新 README 讓 npm 頁面可理解

**Files:**
- Modify: `README.md`
- Test: `npm pack --dry-run`

- [ ] **Step 1: 在開頭保留一句清楚用途描述**

README 開頭應類似：

```md
# todo-continuation-enforcer

Standalone OpenCode plugin that continues unfinished todos when a session becomes idle.
```

- [ ] **Step 2: 補安裝方式與最小使用方式**

在 README 增加類似段落：

````md
## Install

```bash
npm install todo-continuation-enforcer
```

## Usage

Build output is published from `dist/`, and the plugin manifest lives in `.claude-plugin/plugin.json`.

Point your local OpenCode/OpenAgent plugin loader at this repository root, or configure it to load the published plugin entry after installation.
```
````

- [ ] **Step 3: 保留開發與本地載入說明，但讓 npm 訪客先看到 install/use**

README 段落順序建議為：

1. Title + summary
2. Install
3. Usage / Local plugin loading
4. Development
5. Verification checklist

- [ ] **Step 4: 補一個簡短的 publish verification 提示**

加入簡短段落，例如：

````md
## Publish verification

```bash
bun run typecheck
bun test
npm pack --dry-run
npm publish --dry-run
```
````

## Task 3: 跑完整前置驗證並記錄結果

**Files:**
- Verify only: `package.json`, `README.md`, generated `dist/**`

- [ ] **Step 1: 先做程式層驗證**

Run: `bun run typecheck && bun test && bun run build`

Expected:
- typecheck 通過
- 測試通過
- 重新產生 `dist/index.js` 與 declaration files

- [ ] **Step 2: 檢查套件名稱是否已存在**

Run: `npm view todo-continuation-enforcer`

Expected:
- 若回傳 404 / not found，表示名稱可望可用
- 若回傳現有 package metadata，則停止真正 publish，改先討論更名

- [ ] **Step 3: 模擬 tarball 與 publish**

Run: `npm pack --dry-run && npm publish --dry-run`

Expected:
- `prepack` 會自動觸發 build
- dry-run 成功，不出現缺少入口檔或 metadata 錯誤
- 輸出內容符合預期 publish surface

- [ ] **Step 4: 整理真正 publish 時要執行的最終命令**

真正發佈時只需要：

```bash
npm publish
```

若下次再發版，先升版號：

```bash
npm version patch
npm publish
```
