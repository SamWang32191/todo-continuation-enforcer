## Context

目前 continuation 流程由 `session.idle` 事件啟動，先經過 `shouldContinueOnIdle()` 守門，再執行 `runCountdown()`，倒數完成後重新 recheck 一次，最後才呼叫 `injectContinuation()` 送出下一次 prompt。現有取消機制只涵蓋內部事件：`session.error`、`session.compacted`、`session.deleted` 會透過 `state.countdownCancel()` 中止倒數，但沒有使用者可主動觸發的入口。

現有程式其實已預留一個可用的守門點：`shouldContinueOnIdle()` 接受 `isContinuationStopped`，但 `handler.ts` 目前固定傳 `false`。這表示最小且一致的做法不是直接在注入層做攔截，而是把「使用者取消」建模成 session state，讓倒數前判斷、倒數中取消、倒數後 recheck 都共用同一條規則。

另外，plugin 目前只實作 `event` hook 與純顯示型 `toast` adapter；根據目前可確認的 SDK 能力，`tool` 是最明確可由使用者/AI 主動觸發的入口，而 toast action callback 支援度仍不明確，因此設計需要避免把核心行為綁定在未證實的 UI callback 上。

## Goals / Non-Goals

**Goals:**
- 讓使用者能在 countdown 進行中主動取消本次排定中的 continuation 注入。
- 取消後必須保證本次 countdown 對應的注入不會執行，即使取消發生在 countdown 尾端或 recheck 前後。
- 將取消語意整合進既有 session state 與 `shouldContinueOnIdle()` 守門流程，避免額外分叉。
- 提供明確的使用者入口與回饋，讓使用者知道取消是否成功。

**Non-Goals:**
- 不新增永久停用 continuation 的全域開關。
- 不改變既有 `session.error` / `session.compacted` / `session.deleted` 的取消語意。
- 不依賴未證實可用的 toast action callback 作為唯一互動入口。
- 不處理「prompt 已經送出到底層 SDK 後再中止執行」；本 change 的範圍是阻止下一次注入開始。

## Decisions

### 1. 使用 session-scoped 的一次性取消旗標，而不是只呼叫 `countdownCancel()`

在 `SessionState` 增加一次性取消欄位，用來表示「目前排定中的下一次 continuation 注入已被使用者取消」。使用者取消時要同時做兩件事：
- 若 countdown 尚在進行，呼叫 `state.countdownCancel()` 立即結束倒數。
- 設定一次性取消旗標，讓同一輪 idle flow 後續的 fresh recheck / injection 也會被擋下。

這個旗標會在本輪 idle flow 結束時被消耗並清除，讓之後新的 idle 事件仍可正常評估是否需要 continuation；也就是說，取消的是「下一次注入」，不是永久停用。

**Rationale:** 單靠 `countdownCancel()` 只能停止 timer，無法表達取消語意；若取消發生在倒數結束與 `injectContinuation()` 之間，仍需要 state-based guard 才能避免 race condition。

**Alternatives considered:**
- 只沿用 `countdownCancel()`：無法涵蓋倒數剛結束或 recheck 階段的競態。
- 直接在 `injectContinuation()` 前加單點判斷：可擋最後一步，但無法讓前面的 decision/recheck 與記錄保持一致。

### 2. 把取消入口收斂成 handler 的顯式 API

在 enforcer / handler 層新增類似 `cancelNextContinuation(sessionID)` 的顯式方法，由它集中處理：讀取/建立 session state、設定一次性取消旗標、必要時呼叫 `countdownCancel()`、以及回傳取消結果（例如：已取消、沒有進行中的 countdown、session 不存在）。

plugin 層與未來其他入口都只呼叫這個 API，不直接操作 session state。

**Rationale:** 取消本質上是 continuation state machine 的一部分，應由 handler 擁有，這樣可避免 plugin adapter 與核心流程各自維護邏輯。

**Alternatives considered:**
- 讓 plugin 層直接存取 `SessionStateStore`：會破壞封裝，增加測試與維護成本。
- 透過合成 `session.error` 或 `session.compacted` 事件模擬取消：會混淆真實事件語意，也不利於日後分析與除錯。

### 3. 第一版使用 plugin `tool` 暴露使用者主動取消入口

在 plugin hooks 新增一個明確的取消工具，例如 `cancel_next_continuation`。工具執行時呼叫 handler 的取消 API，並回傳人類可讀結果；若 SDK 能從 tool context 取得目前 session，就直接取消當前 session，否則再以明確參數傳入 session ID。

toast 仍保留為顯示型回饋：countdown 顯示剩餘秒數，取消成功後額外顯示「下一次 continuation 已取消」的訊息，但不把取消能力建立在 toast callback 上。

**Rationale:** 目前已知 SDK 中，`tool` 是最清楚、最可落地的使用者觸發入口；相較之下，toast action 在 plugin SDK 層是否可綁定 callback 尚未被文件充分證實。

**Alternatives considered:**
- 新增 custom event：目前 plugin event handler 僅處理 session 事件，且是否能從 UI 穩定發送 custom event 不明。
- 直接做 toast button：UX 可能更好，但文件不足，風險較高，適合作為後續 enhancement。

### 4. 重用既有 `isContinuationStopped` 守門，而不是新增另一條取消分支

`handler.ts` 在兩次 `shouldContinueOnIdle()` 呼叫時，都應從 session state 帶入「這一輪是否已被使用者取消」；一旦守門回傳 `stopped`，本輪 flow 直接結束，不再進入後續注入。這讓「開始前就已取消」、「倒數中取消」、「recheck 前取消」都走同一條決策路徑。

**Rationale:** 既有 guard 已存在，重用它可讓記錄、除錯與測試都維持一致，也降低設計複雜度。

**Alternatives considered:**
- 在 `runCountdown()` 回傳值外再加額外分支：可行，但 decision 與 state 語意仍分散。

### 5. 取消語意限定為「本次 pending continuation」，不預先阻止未來所有 idle 注入

若使用者在 countdown 期間執行取消，本次排定中的 continuation 會被放棄；但之後若 session 再次進入新的 idle 週期，而且 todos 仍未完成，系統仍可重新評估是否要注入。若沒有 active countdown，取消工具應回傳 no-op 或明確告知「目前沒有可取消的 pending continuation」。

**Rationale:** 這最符合使用者原始需求，也能避免把簡單的「取消下一次」擴張成更大範圍的 pause/resume feature。

**Alternatives considered:**
- 支援預先取消下一次未來 idle：需求邊界較模糊，且會把語意從 cancel pending countdown 擴張成 scheduling policy。

## Risks / Trade-offs

- **[Tool 入口可用性依賴 host UX]** → 雖然 `tool` 是目前最明確的 SDK 入口，但實際操作仍可能需要使用者透過 agent/tool 流程觸發；以「取消成功 toast + 清楚工具命名」降低心智負擔，後續再評估是否補 UI button。
- **[取消與注入交界的 race condition]** → 使用一次性取消旗標加上兩次 `shouldContinueOnIdle()` 共用 guard，避免只停 timer 卻沒擋住後續 recheck/injection。
- **[一次性旗標的清理時機錯誤]** → 由 handler 在單一 flow 結束時統一 consume/clear，避免殘留成永久停用。
- **[沒有 active countdown 時的取消語意]** → 明確定義為 no-op，不把需求外擴成全域 pause。
- **[未來若加入更多入口，狀態處理可能分散]** → 所有入口都必須走 `cancelNextContinuation(sessionID)`，禁止直接操作 state。

## Migration Plan

這是純行為增量，沒有資料遷移需求。部署順序可直接是：新增 session state 欄位與 handler API、串接 `shouldContinueOnIdle()` 守門、加入 plugin tool 入口與取消回饋、補測試。若需要回滾，只要移除新旗標與 tool 入口即可回到現況。

## Open Questions

- tool execution context 是否保證能取得目前 session ID；若不能，工具介面需不需要顯式要求 session ID 參數？
- host SDK 是否已支援可安全使用的 toast action callback；若有，是否要在後續版本把取消入口從純 tool 擴展成 countdown toast 上的快捷操作？
