# Handler Modularization and Failure Threshold Design

## Summary

在不改變 plugin 對外行為的前提下，將 `todo-continuation-enforcer` 的核心流程從單一肥大的 `handler.ts` 拆成較清楚的 idle / cleanup / countdown-state 模組，並補上 `too_many_failures` 的直接回歸測試。

## Goals

- 讓 `handler.ts` 回到事件入口與高層路由角色
- 把 countdown 相關 timer / interval / cancel 清理集中到單一 helper
- 把 interrupt / error / compacted / deleted 的狀態收斂邏輯與 idle 主流程分開
- 補上 failure threshold 的直接測試，確認達上限後不再 inject

## Non-Goals

- 不加入第 4 點 observability / logger / debug 輸出調整
- 不改 public command、tool、prompt 文案或 `createPlugin()` 對外介面
- 不擴大到 `session-api.ts` 拆分與 noop abstraction 清理
- 不重做整體測試架構，只補本次重構需要的最小回歸保護

## Chosen Approach

採用模組化拆分：

1. `handler.ts` 保留 `createTodoContinuationHandler()` 與對外方法，但內部事件處理改為委派。
2. 新增 `idle-cycle.ts`，封裝 idle path 的 precheck → countdown → recheck → inject → failure tracking。
3. 新增 `cleanup.ts`，統一處理 interrupt / deleted / compacted / error 導致的狀態收斂。
4. 新增 `countdown-state.ts`，集中處理 countdown timer / interval / cancel / pendingContinuation 的 reset/cancel 行為。

這個方案比 helper-only 更能真正縮小 `handler.ts` 責任，但又比全面重組 event router / state coordinator 的風險更低。

## File Boundary Plan

### Create

- `src/todo-continuation-enforcer/countdown-state.ts`
  - 提供 countdown 清理與取消 helper
- `src/todo-continuation-enforcer/cleanup.ts`
  - 提供 cleanup event handler
- `src/todo-continuation-enforcer/idle-cycle.ts`
  - 提供 idle cycle orchestration

### Modify

- `src/todo-continuation-enforcer/handler.ts`
  - 改成高層路由與 factory wiring
- `src/todo-continuation-enforcer/countdown.ts`
  - 改用 `countdown-state.ts` 的清理 helper
- `src/todo-continuation-enforcer/session-state.ts`
  - dispose 時改用同一套 countdown cleanup helper
- `tests/unit/idle-decision.test.ts`
  - 補 `too_many_failures` case
- `tests/integration/todo-continuation-enforcer.integration.test.ts`
  - 補 failure threshold 相關回歸測試

## Target Flow

### Idle Path

1. `handler.ts` 收到 `session.idle`
2. `idle-cycle.ts` 讀取 todos / latest message / background task 狀態
3. 先跑 `shouldContinueOnIdle()` gate
4. 通過後預覽 stagnation 狀態
5. 啟動 countdown
6. countdown 結束後重新抓取 fresh state，再跑一次 gate
7. 通過才 inject continuation，並 commit stagnation / reset failure count

### Cleanup Path

1. `handler.ts` 收到 `session.interrupt` / `session.deleted` / `session.compacted` / `session.error`
2. `cleanup.ts` 依事件型別更新 state
3. 若有 countdown 或 pending continuation，一律走共用 `countdown-state.ts` 清理

## Countdown State Rules

`countdown-state.ts` 應提供可重用的小函式，避免同樣的 timer 清理散落在三處。

預期至少包含：

- `clearCountdownResources(state)`：只清 timer / interval / cancel 欄位
- `cancelPendingContinuation(state)`：取消 countdown 並將 `pendingContinuation` 收斂為 false

這兩個 helper 供 `countdown.ts`、`session-state.ts`、`cleanup.ts` 共用。

## Failure Threshold Testing

本次至少補兩層保護：

1. **unit**：`shouldContinueOnIdle()` 在 `consecutiveFailures >= MAX_CONSECUTIVE_FAILURES` 時回傳 `too_many_failures`
2. **integration**：連續失敗達門檻後，後續 `session.idle` 不再 inject continuation

測試優先重用既有 fake / fixture，不新增重複的 `SessionApi` stub。

## Risks and Mitigations

### Risk: 拆分後狀態更新順序改變

- 保持既有 `finally` 收尾語意
- 以既有 integration tests 作為主要回歸保護

### Risk: countdown helper 抽出後造成雙重清理

- 讓所有 countdown 清理都收斂到共用 helper
- 避免在多處各自手動操作 timer 欄位

### Risk: failure threshold 測試過度依賴內部實作

- unit test 只驗證 gate 結果
- integration test 只驗證外部行為：達門檻後不再 inject

## Success Criteria

- `handler.ts` 明顯縮小為事件入口與高層委派
- countdown cleanup 不再散落於多個檔案各自手寫
- interrupt / error / compaction / deleted 收尾邏輯不再混在 idle path 中
- `too_many_failures` 有直接測試保護
- `bun run typecheck` 與 `bun test` 持續通過
