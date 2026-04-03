---
id: git-pull-after-merged-pr-with-local-duplicate-changes
date: 2026-04-03
scope: project
tags: [git, pull, stash, worktree, cleanup]
source: bug-fix
confidence: 0.5
related: [[opencode-plugin-design-should-check-local-installed-types]]
---

# PR 已 merge 後若 main 還有重複未提交內容，先 stash 再用 ff-only 同步

## Context
在 feature worktree 完成並 merge PR 後，主工作目錄的 `main` 仍殘留一批與 PR 重疊的未提交變更與未追蹤檔，導致 `git pull` 失敗。

## Mistake
如果只看到 `git pull` 的 divergent branches 訊息，很容易以為只要選 merge/rebase 策略就好；但實際上常同時存在會被 merge 覆蓋的本地未追蹤檔與已被 stash 收走的開發依賴，必須先分層處理。

## Lesson
- 先分開確認兩種 root cause：`pull` 策略未指定，以及工作樹有會被遠端覆蓋的本地變更/未追蹤檔。
- 當 PR 已 merge 到 remote main 時，主工作目錄同步優先用 `git pull --ff-only`，避免不必要的 merge commit。
- 若 main 有本地重複變更，先 `git stash push -u`；若仍有未追蹤檔阻擋 merge，再補一次 `git stash push -a`。
- stash 若含未追蹤檔，之後要取回這些檔案時，需從 `stash@{n}^3` 取，而不是一般的 `git checkout stash@{n} -- <path>`。
- 若 stash 把 `node_modules` 一起收走，重新驗證前要先重裝依賴再跑測試。

## When to Apply
當這個 repo 使用 worktree 開發、PR 已 merge 到 remote，但主工作目錄仍有重複未提交內容，導致無法順利同步 `main` 時。
