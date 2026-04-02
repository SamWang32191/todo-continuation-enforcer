# Core Simplification Design

## Summary

在不改變對外行為的前提下，精簡 `todo-continuation-enforcer` 的核心程式碼結構，優先降低 `handler.ts` 與 `session-api.ts` 的責任密度，並移除只有形式價值、沒有明確替換價值的抽象層。

## Goals

- 保留既有 plugin / core 兩層邊界
- 降低核心流程的閱讀與維護成本
- 讓事件路由、idle continuation 流程、interrupt/cleanup 流程各自獨立
- 讓 `session-api.ts` 回到「runtime 轉接層」角色，而不是兼任大型 normalize / type-guard 集中站
- 只做低風險、可由現有測試保護的重整

## Non-Goals

- 不重寫 continuation 規則本身
- 不改變 public command、prompt 文案、或外部行為契約
- 不同時大幅整理 release workflow、README、或整體測試結構
- 不追求一次把檔案數量壓到最少

## Chosen Approach

採用「保守精簡」：保留既有大邊界，但把過度集中的責任拆開，並只合併明顯沒有必要的薄抽象。

這個方向同時滿足兩個目標：

1. **縮小責任面**：讓大型檔案不再同時處理多條主流程
2. **適度減少抽象**：只移除不提供實際替換價值的工廠 / noop 包裝

## Problem Areas

### 1. `src/todo-continuation-enforcer/handler.ts`

目前同時負責：

- 事件分派
- idle cycle orchestration
- countdown 前後檢查
- interrupt / error / deleted cleanup
- fallback 與錯誤處理

這讓單一檔案成為總控中心，閱讀時需要持續在多種事件語意之間切換。

### 2. `src/plugin/adapters/session-api.ts`

目前混合：

- runtime API 轉接
- payload 驗證
- message normalize
- todo normalize
- 文字擷取與型別防禦

這使 adapter 層過厚，也把本來可以獨立測試與重用的小邏輯綁在同一處。

### 3. `create*` / noop 抽象

部分工廠與 noop wrapper 的存在主要是形式一致，而不是提供清楚的替換點。這增加檔案跳轉與認知負擔，但未明顯提升可擴充性。

## Target Architecture

### 1. Plugin Layer Remains Thin

`src/plugin/` 持續只負責：

- plugin 建立
- OpenCode 事件與命令接線
- 將 runtime 依賴注入 core

plugin 層不承擔 continuation 規則判定。

### 2. Core Layer Becomes Workflow-Oriented

`src/todo-continuation-enforcer/` 依流程拆成少數高內聚模組：

- **event routing**：把不同事件導向對應處理器
- **idle cycle**：負責 idle 時的主流程協調
- **interrupt / cleanup**：負責中斷、清理、recovering 狀態收尾
- **shared state / rules**：保留原本純邏輯模組

重點不是追求最細切分，而是讓每個模組只需要理解一條流程。

### 3. Session API Becomes a Narrow Adapter

`session-api.ts` 應只保留：

- 與宿主 API 互動
- 呼叫較小的 helper 進行資料轉換

下列內容外移為 helper：

- message extraction / normalization
- todo normalization
- runtime payload guard

如此可讓 adapter 本體回到薄轉接層，helper 再視需要各自維護與測試。

## File Boundary Plan

### Keep As-Is or Nearly As-Is

- `abort-detection.ts`
- `compaction-guard.ts`
- `session-state.ts`
- `todo.ts`
- `pending-question-detection.ts`
- `stagnation-detection.ts`

這些檔案已有明確單一責任，不是本次精簡主軸。

### Refactor for Responsibility Separation

- `handler.ts`
- `session-api.ts`
- 視需要調整 `event-handler.ts`

### Merge or Remove if Clearly Redundant

- 僅為統一樣板而存在的 `create*` 包裝
- 僅提供空實作但沒有獨立替換價值的 noop helper

是否移除的標準：

1. 沒有清楚的注入邊界價值
2. 沒有單獨測試價值
3. 只造成額外跳轉，不提供語意增益

## Expected Event Flow After Simplification

### Idle Path

1. plugin 收到 event
2. event router 判斷是否為 continuation 相關事件
3. `idle-cycle` 負責：
   - 讀取 session 狀態
   - 執行 eligibility checks
   - 啟動 countdown
   - countdown 結束前做 final recheck
   - 注入 continuation prompt
4. 更新 session state

### Interrupt / Error / Cleanup Path

1. event router 導向 cleanup handler
2. cleanup handler 負責：
   - 取消 timer / countdown
   - 清理 in-flight 狀態
   - 更新 recovering 或錯誤計數
3. 不讓 idle path 內含這些收尾細節

## Error Handling

原則維持不變：**寧可跳過，不要誤注入。**

- 讀取 todos 或 messages 失敗：記錄並跳過本輪
- normalize 失敗：回傳空結果或安全 fallback，不污染 session state
- inject 失敗：保留既有 failure tracking
- interrupt / deleted / compaction 後：確保 timer 與狀態收斂在 cleanup handler

## Testing Strategy

本次精簡先依賴既有測試保護，不先重做整體測試結構。

至少確認以下回歸情境：

- incomplete todo + idle -> countdown -> inject
- pending question -> 不 inject
- interrupt / cancel-next-continuation -> 正確取消 pending continuation
- compaction / error 後不誤 inject

若 helper 被拆出且邏輯變得獨立，可補最小單元測試，但不把本次範圍擴大成整體測試重整。

## Implementation Sequence

1. 先拆 `handler.ts` 的流程責任，建立較清楚的 routing / idle / cleanup 邊界
2. 再縮小 `session-api.ts`，把 normalize / guard helper 外移
3. 最後移除或合併明顯冗餘的 `create*` / noop 抽象
4. 跑 typecheck / test，必要時補最小 regression

## Risks and Mitigations

### Risk: 邊界拆開後反而增加檔案數

Mitigation：

- 只在責任真的分離時才拆
- 不為了形式而切太細

### Risk: 清理流程散落，造成 session state 不一致

Mitigation：

- 把 cleanup 視為單獨流程，而不是讓多個模組各自局部清理

### Risk: 過早移除抽象，損失測試或注入彈性

Mitigation：

- 只有在抽象沒有明確替換價值時才移除
- 保留真正有宿主隔離意義的 adapter 邊界

## Success Criteria

- `handler.ts` 不再同時承載所有 continuation 相關流程
- `session-api.ts` 明顯縮小為 runtime adapter
- 核心事件流程更容易沿著單一路徑閱讀
- 現有 public 行為不變
- typecheck 與測試持續通過
