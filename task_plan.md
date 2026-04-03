# 任務計畫

## 目標
- 依照使用者指定，只處理優化項目 1/2/3：
  1. 拆分 `src/todo-continuation-enforcer/handler.ts`
  2. 收斂 countdown cleanup
  3. 補 failure threshold 與相關回歸測試
- 明確不納入第 4 點 observability 變更。

## 階段
| 階段 | 狀態 | 說明 |
|---|---|---|
| 1 | complete | 恢復上下文、整理設計、取得核准 |
| 2 | complete | 撰寫設計與實作計畫檔 |
| 3 | complete | 重構 handler 與 countdown cleanup |
| 4 | complete | 補 failure threshold 測試 |
| 5 | complete | 驗證 typecheck 與 test |

## 決策
- 以小範圍重構為主，不改 plugin 對外行為。
- 先做設計核准，再展開實作。
- 已獲使用者核准：採「模組化拆分」而非保守 helper-only 或全面重組。
- `handler.ts` 保留事件入口與高層 orchestration；新增 idle / cleanup / countdown-state 小模組。
- 因目前工作樹已有未提交變更，本輪繼續在現有工作區完成，不另搬移到新 worktree。

## 遇到的錯誤
| 錯誤 | 嘗試次數 | 解決方案 |
|---|---:|---|
| `cancelPendingWork()` 在 countdown 後、inject 前視窗無法真正取消 | 1 | 以 TDD 補 regression test，並在 `idle-cycle.ts` 的 countdown 後與 final recheck 後補 `pendingContinuation` guard |
