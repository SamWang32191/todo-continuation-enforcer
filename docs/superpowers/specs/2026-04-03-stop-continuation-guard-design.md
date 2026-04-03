# Stop Continuation Guard 重構設計

## 概要

本次重構將目前以「取消下一次 pending continuation」為中心的機制，改為以 `stop-continuation-guard` 為中心的 stop 語意。

目標是對齊 `/Users/samwang/Repo/oh-my-openagent` 中較完整的取消模型，但以本 repo 目前實際安裝的 `.opencode/node_modules/@opencode-ai` API 能力為準，而不是直接移植所有背景任務管理抽象。

本設計確認的前提如下：

- `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` 存在 `Hooks["chat.message"]`
- `.opencode/node_modules/@opencode-ai/plugin/dist/tool.d.ts` 中 `ToolContext` 明確提供 `sessionID`
- `.opencode/node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` 提供 `session.abort`、`session.messages`、`session.promptAsync`、`session.todo`
- 目前本地安裝版本中，未發現可直接對 descendant background tasks 做列舉與取消的 API

因此，本設計採用：

- stop state 由 guard 持有
- `chat.message` 作為 stop state 清除入口
- `session.abort` 作為 stop 時中斷當前 session 執行的手段
- 不承諾實作 descendant background task 精準取消

## 目標

1. 將外部語意改為 stop-only，而非 cancel-next-only
2. 避免 countdown、pending injection、與 stop state 分散在多處
3. 讓 stop 狀態在新 user message 到來前持續有效
4. 讓 countdown、fresh recheck、最終 injection 在所有關鍵 gate 都能被 stop 擋下
5. 保持未來 idle cycle 可在 user 明確發話後恢復

## 非目標

1. 不直接複製 `oh-my-openagent` 的 descendant background task manager
2. 不為目前 repo 自建完整 background task tree abstraction
3. 不保留舊的 `/cancel-next-continuation` 作為主語意入口

## 架構

### 1. stop-continuation-guard

新增 `stop-continuation-guard` 模組，作為 stop 狀態的唯一真相來源。

責任：

- 記錄某 session 是否為 stopped
- 提供 `stop(sessionID)`
- 提供 `isStopped(sessionID)`
- 提供 `clear(sessionID)`
- 在 `session.deleted` 時做 cleanup
- 在 `chat.message` 收到新的 user message 時解除 stop

建議狀態：

- `stopped: boolean`
- `stoppedAt?: number`

`stoppedAt` 僅用於 debug 與測試事件順序，不影響業務邏輯。

### 2. todo-continuation-enforcer

`todo-continuation-enforcer` 專注 continuation 執行態，不再持有 stop lifecycle。

保留責任：

- idle 條件判定
- countdown 生命週期
- fresh recheck
- continuation injection
- stagnation / compaction / abort 相關保護

新增依賴：

- `isContinuationStopped(sessionID: string): boolean`

移除或弱化責任：

- 移除 `continuationStopped` 作為主要 stop 狀態來源
- 不再由 enforcer 決定 stop 何時解除

### 3. SessionStateStore

`SessionStateStore` 保留為 continuation runtime state store，但只管理執行態：

- `inFlight`
- `pendingContinuation`
- `countdownTimer`
- `countdownInterval`
- `countdownCancel`
- `awaitingPostInjectionProgressCheck`
- `stagnationCount`
- `consecutiveFailures`
- compaction / abort 相關欄位

`continuationStopped` 不再作為持久 stop state 的欄位；若實作過程保留短暫過渡欄位，也只能是內部遷移用，不得再作為對外語意依據。

## 事件流

### A. stop 流程

所有 stop 入口最終收斂到同一個 domain action：`stop(sessionID)`。

執行順序：

1. `stop-continuation-guard.stop(sessionID)` 標記 stopped
2. `todo-continuation-enforcer.cancelPendingWork(sessionID)`
   - 取消 countdown
   - 清掉 pending continuation
   - 讓 inject 前暫態失效
3. `sessionApi.abort(sessionID)` 中止當前 session 執行
4. 以 toast / tool 回傳成功訊息

此操作應為 **idempotent**：對同一 session 連續 stop 不應報錯，也不應留下殘狀態。

### B. idle 流程中的 stop gate

以下節點都必須檢查 `isContinuationStopped(sessionID)`：

1. idle 事件進入後、開始任何 continuation 評估前
2. countdown 開始前
3. countdown 完成後、fresh recheck 前
4. 最終 inject 前

這可確保 stop 即使發生在 race 中途，也會在下一個 gate 被擋下。

### C. chat.message 清除 stop

新增 `chat.message` hook：

1. 收到 message 時，以 hook input 的 `sessionID` 定位 session
2. 若該 session 目前為 stopped，且本次訊息屬於新的 user message
3. 呼叫 `stop-continuation-guard.clear(sessionID)`

清除後，未來 idle cycle 才能重新進入 continuation 評估。

### D. cleanup

- `session.deleted`
  - 清 guard state
  - 清 enforcer runtime state
- `session.compacted`
  - 保持現有 countdown cancel 與 compaction guard 行為
  - 不解除 stop
- `session.error`
  - 保持現有 abort/error handling
  - 不解除 stop

## 外部 API 設計

### formal command

- 新主入口：`/stop-continuation`

command event 應仍優先使用 event payload 的 `sessionID`。

### tool

- 新 tool：`stop_continuation`

參數：

- `sessionID?: string`

session 解析規則：

1. 顯式 `input.sessionID`
2. `context.sessionID`

在目前實際安裝版本中，`context.sessionID` 是強型別存在的；但 formal command 路徑仍應優先使用 command event payload，以維持 command/tool 收斂並遵守既有 lessons。

### 回應語意

回傳應採成功且可重入的語意：

- 第一次 stop：`Stopped continuation for session <id>.`
- 已 stopped 再 stop：仍回成功，可補充 `Continuation already stopped for session <id>.`

## 測試設計

### 1. stop active countdown

- countdown 進行中觸發 stop
- countdown 立即停止
- 不會 inject
- `session.abort` 被呼叫

### 2. stop before final inject

- countdown 完成但 inject 尚未執行時 stop
- 最終 inject 被跳過

### 3. stop is sticky

- stop 後，即使之後有 idle
- 在新 user message 前都不得續跑 continuation

### 4. new user message clears stop

- `chat.message` 收到新的 user message 後 clear
- 後續 idle cycle 可重新評估 continuation

### 5. stop is idempotent

- 連續 stop 多次不報錯
- 不留下錯誤狀態

### 6. cleanup on session.deleted

- session 刪除時 guard 與 enforcer state 都清掉

### 7. backward-compat safety

- 若暫時保留相容入口，需驗證它們最終仍收斂到同一個 stop action

## 實作分解

1. 新增 `stop-continuation-guard` 模組與測試
2. 擴充 plugin hooks：`event`、`chat.message`、`tool`
3. 將舊 cancel-next command/tool 改為 stop-only API
4. 在 enforcer 注入 `isContinuationStopped` 依賴
5. 將 `cancelNextContinuation` 演進為 `cancelPendingWork` / `stop` 導向邏輯
6. 增加 `sessionApi.abort(sessionID)` adapter
7. 改寫整合測試，覆蓋 stop / clear / cleanup / idempotency

## 風險與取捨

### 1. `session.abort` 的粒度

本 repo 目前只能可靠使用 `session.abort`，因此 stop 對背景工作的控制粒度比 `oh-my-openagent` 粗。

接受此取捨的理由：

- 符合目前已安裝 API 能力
- 可先建立正確的 stop lifecycle
- 未來若 host 暴露 descendant task cancel API，可在 guard 後方替換中止策略

### 2. `chat.message` 的 user message 判斷

依目前 `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`，`chat.message` 的 output 型別為 `message: UserMessage`，因此設計上先以「此 hook 對應新的 user message」為前提來 clear stop state。

若實作驗證時發現 runtime 行為比型別更寬，需再補充顯式判斷，但本次設計不以 assistant-side message 觸發 clear 為預設。

### 3. 過渡期相容

若為減少破壞需要暫時保留舊入口，必須明確讓其收斂到相同 stop action，避免語意分岔。

## 驗收標準

以下條件同時成立才算完成：

1. 使用者可透過 stop-only command/tool 停止 continuation
2. stop 後不再有 pending countdown 或 inject 落地
3. stop 後 session 進入封鎖狀態，直到新 user message 到來
4. 新 user message 到來後，後續 idle cycle 可重新評估 continuation
5. `session.deleted` 會清除所有 stop 與 runtime state
6. 行為有整合測試覆蓋，包含 race-sensitive 的倒數中與 inject 前 stop 場景

## 備註

本文件只定義設計，不代表已實作或已驗證通過。由於目前對話沒有明確要求建立 git commit，因此本次只寫入 spec，不自動提交。
