---
id: github-actions-metadata-step-stderr-regression
date: 2026-03-31
scope: project
tags: [github-actions, bash, quoting, stderr, regression-test]
source: bug-fix
confidence: 0.5
related: [[release-workflow-publish-preflight]]
---

# GitHub Actions metadata steps need stderr-aware regression coverage

## Context
在修復 release workflow 的 `Read package metadata` step 時，GitHub Actions 因 shell quoting 錯誤失敗；本機重現後發現，類似腳本即使 bash 在 command substitution 印出 syntax error，整個 step 仍可能因外層 `echo/printf` 成功而維持 exit code 0。

## Mistake
如果只檢查 step exit code，會漏掉 `$(...)` 內部 quoting 壞掉、stderr 已有 parse error、但 `GITHUB_OUTPUT` 寫出空值的情況。

## Lesson
- 對 GitHub Actions 內會寫 `GITHUB_OUTPUT` 的 shell step，regression test 不只要檢查 exit code，也要檢查 stderr 與實際輸出內容。
- 避免在 `echo "...$(node -p \"...\")"` 這類巢狀 quoting 寫法中混用過多跳脫；優先用 `printf 'key=%s\n' "$(...)"` 或 heredoc/node script。

## When to Apply
當 repo 新增或修改 GitHub Actions workflow，且 step 需要用 bash command substitution 產生 outputs、env 檔或 metadata 時使用。
