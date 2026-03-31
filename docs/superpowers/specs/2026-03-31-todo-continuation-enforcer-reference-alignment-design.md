# Todo Continuation Enforcer Reference Alignment Design

## Summary

調整 `todo-continuation-enforcer`，讓它在核心 continuation 行為上盡可能貼近 `oh-my-openagent/src/hooks/todo-continuation-enforcer`，特別是恢復 countdown 後自動 inject continuation prompt 與 toast 式倒數顯示；唯一刻意保留的主要差異，是 pending question 判定比參考 repo 更寬，除了 `question` tool invocation 之外，也把最後一則 assistant 純文字以 `?` 結尾視為等待使用者回覆。

## Goals

- 讓 countdown 結束後重新執行 continuation prompt injection
- 讓 countdown 期間顯示 toast 式倒數提示
- 保留現有 countdown 取消與 recheck 保護
- 讓 pending question 判定同時支援 `question` tool 與文字結尾 `?`
- 讓測試主線重新對齊「idle -> countdown -> inject」

## Non-Goals

- 不追求完整搬移 `oh-my-openagent` 的所有 session state 細節
- 不引入參考 repo 的完整 logger、message-directory、sqlite fallback 或 shared utility 鏈
- 不新增額外 UI 互動，toast 僅作為倒數顯示
- 不改變目前 repo 的 plugin 邊界與 adapter 方向

## Chosen Approach

採用「參考行為對齊 + 最小結構改動」：

1. 保留現有 `handler.ts` 的 idle gate、countdown、fresh recheck 主流程
2. 將 `countdown.ts` 升級為真正的 countdown controller，負責 toast 顯示、每秒更新、取消清理
3. 保留 `continuation-injection.ts` 作為正式注入點，恢復 countdown 完成後 inject continuation prompt
4. 擴充 `SessionApi` / `MessageInfo`，讓 pending question 判定可以同時看 tool invocation 與文字尾問號
5. 僅在 pending question semantics 上與參考 repo 故意差異化

## Behavior Alignment Boundary

### 對齊參考 repo 的項目

- `session.idle` 通過 eligibility checks 後才啟動 countdown
- countdown 預設為 **5 秒**
- countdown 期間顯示 toast 式倒數提示
- countdown 可被 `session.error`、`session.deleted`、`session.compacted` 中斷
- countdown 結束後再次檢查條件，通過才 inject continuation prompt
- inject 成功後更新 `lastInjectedAt`、`awaitingPostInjectionProgressCheck`、failure state

### 刻意保留差異的項目

- pending question 判定採雙軌：
  - 最後 assistant 訊息含 `question` tool invocation
  - 或最後 assistant 純文字去空白後以 `?` 結尾
- 任一成立都視為等待使用者回覆，阻擋 countdown 與 inject

## Architecture

### 1. Session Message Shape Upgrade

`src/plugin/adapters/session-api.ts` 的 `MessageInfo` 目前只保留簡化後的 `text`、`role`、`agent`、`model`。為支援更貼近參考 repo 的判定，需要新增 message part 資訊，至少保留：

- `type`
- `name`
- `toolName`
- `text` / `prompt`（若為 text part）

SDK adapter 仍維持「只讀最後一則訊息」的策略，但會把最後訊息的 parts 一起正規化進 `MessageInfo`。

### 2. Pending Question Detection

`src/todo-continuation-enforcer/pending-question-detection.ts` 由單純 `text.endsWith("?")` 判定，升級為：

1. 若最後訊息不是 assistant，回傳 `false`
2. 若 parts 中存在 `tool_use` / `tool-invocation` 且名稱是 `question`，回傳 `true`
3. 否則若整理後文字以 `?` 結尾，回傳 `true`
4. 其餘回傳 `false`

這讓目標 repo 在不失去現有問句 fallback 的情況下，更接近參考 repo 對 `question` tool 的明確偵測。

### 3. Countdown with Toast

`src/todo-continuation-enforcer/countdown.ts` 需從單純等待器改成 countdown runtime：

- 啟動時立即顯示第 5 秒 toast
- 每秒更新剩餘秒數
- 寫入 `countdownTimer`、`countdownInterval`、`countdownCancel`
- 完成或取消時清理 timer / interval / cancel handle

toast 文案對齊參考 repo 語意，例如：

- title: `Todo Continuation`
- message: `Resuming in 5s... (3 tasks remaining)`

若宿主沒有 TUI toast 能力，adapter 層應安全降級成 no-op，而不是讓整個 continuation flow 失敗。

### 4. Injection Path Restoration

`src/todo-continuation-enforcer/handler.ts` 在 fresh recheck 通過後，恢復呼叫 `injectContinuation()`。

流程為：

1. initial idle gate
2. stagnation preview
3. countdown + toast
4. fresh todos / latest message recheck
5. `injectContinuation()`
6. 成功後提交 stagnation state 與 session state

### 5. Prompt Strategy

`src/todo-continuation-enforcer/continuation-injection.ts` 維持以 `CONTINUATION_PROMPT` 加上 remaining todos 清單的方式注入。此行為刻意與參考 repo 一致：當 todo 尚未完成，系統會要求 agent 繼續工作，而不是停在 idle。

## Event Flow

1. plugin 收到 `session.idle`
2. 讀取 todos 與 latest message info
3. 執行 idle gate：
   - incomplete todos
   - no pending question
   - no recent abort
   - no background task
   - no cooldown
   - no compaction guard
   - no skip agent
4. 通過後啟動 **5 秒** countdown，顯示 toast
5. countdown 期間若收到 `session.error` / `session.deleted` / `session.compacted`，取消 countdown
6. countdown 結束後重新抓 todos / latest message info 做 fresh recheck
7. fresh recheck 通過後 inject continuation prompt
8. 更新 session state

## File Impact Plan

### Must Change

- `src/plugin/adapters/session-api.ts`
- `src/todo-continuation-enforcer/pending-question-detection.ts`
- `src/todo-continuation-enforcer/countdown.ts`
- `src/todo-continuation-enforcer/handler.ts`
- `src/todo-continuation-enforcer/types.ts`

### Likely Change

- `src/todo-continuation-enforcer/continuation-injection.ts`
- `src/plugin/create-plugin.ts` 或對應 adapter wiring（若需要傳入 toast 能力）
- `tests/helpers/fakes.ts`

### Test Files to Update

- `tests/unit/continuation-injection.test.ts`
- `tests/unit/idle-decision.test.ts`
- `tests/integration/todo-continuation-enforcer.integration.test.ts`
- 新增或擴充 `pending-question-detection` / `countdown` 專屬測試

## Testing Strategy

### Unit Tests

- `question` tool invocation 會被判定為 pending question
- assistant 文字以 `?` 結尾會被判定為 pending question
- 非 assistant 訊息不會誤判
- countdown 會依秒數更新並可取消
- continuation injection 仍包含 remaining todos 與 continuation prompt

### Integration Tests

- idle + incomplete todo + 無阻擋條件 -> countdown 完成後 inject
- countdown 期間有 `session.error` -> 不 inject
- countdown 期間有 `session.deleted` -> 不 inject
- countdown 期間有 `session.compacted` -> 不 inject
- `question` tool pending -> 不 countdown / 不 inject
- assistant 文字尾端 `?` -> 不 countdown / 不 inject
- toast 顯示次數與文案符合 5 秒倒數預期

## Success Criteria

- 目標 repo 在主流程上重新符合「idle -> 5s countdown toast -> inject continuation prompt」
- countdown 可被 error / deleted / compacted 正確取消
- pending question 判定同時支援 `question` tool 與文字尾問號
- 單元與整合測試能證明上述行為
- 整體差異明確收斂到 pending question semantics，而不是整條 continuation 主線
