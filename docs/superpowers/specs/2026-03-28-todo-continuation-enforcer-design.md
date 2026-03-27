# Todo Continuation Enforcer Design

## Summary

將 `oh-my-openagent` 內的 `todo-continuation-enforcer` 抽成一個可獨立載入的 plugin，第一版以**行為相容**為主，目標是在新 repo `todo-continuation-enforcer/` 中提供最小可運作版本，並保留基本測試。

## Goals

- 複製 `todo-continuation-enforcer` 的核心行為
- 在空白 repo 中建立真正獨立的 plugin
- 第一版可本地載入並附帶基本測試
- 只抽取必要依賴，不搬整個 `oh-my-openagent` 框架

## Non-Goals

- 不一起搬移 `atlas`、`stop-continuation-guard`、`background-notification`
- 不先做完整發佈流程或 registry 發佈
- 不先做高度通用化或大量設定化
- 不整包複製 `oh-my-openagent` 的 shared / feature 系統

## Chosen Approach

採用「最小依賴抽離成真正獨立 plugin」：

1. 保留 `todo-continuation-enforcer` 的核心判定與狀態機
2. 將宿主綁定點改寫成新 repo 的薄 adapter
3. 重寫事件 wiring、countdown、continuation injection 的整合層
4. 以新 plugin entrypoint 載入並暴露最小功能面

## Architecture

### 1. Plugin Entry Layer

負責被 OpenCode / OpenAgent 載入，建立 plugin instance、註冊事件處理器、初始化 adapters 與 feature 實例。

原則：

- `src/index.ts` 只做 export
- plugin 建立與 event routing 放在 `src/plugin/`
- 不放 continuation 的業務判定

### 2. Continuation Feature Layer

`src/todo-continuation-enforcer/` 放核心邏輯：

- idle eligibility checks
- abort / pending question / stagnation / compaction guard
- countdown
- continuation prompt 注入
- per-session state management

此層應依賴抽象介面，而不是直接依賴 `oh-my-openagent` 模組。

### 3. Runtime Adapter Layer

`src/plugin/adapters/` 提供薄介面，把宿主 API 與 feature 解耦：

- `SessionApi`: 讀 todos、讀訊息、注入 prompt
- `BackgroundTaskProbe`: 查 session 是否有 running background task
- `MessageStore`: 非 sqlite 或 fallback 的最近訊息解析
- `Logger`: debug / info / warn 封裝

### 4. Minimal Config and Test Layer

提供最小 plugin manifest、套件設定與測試支撐，優先保證：

- 本地載入成功
- `session.idle` 時能依條件自動續跑
- 常見保護條件不會誤觸發

## File Boundary Plan

### Can Be Moved Almost As-Is

- `abort-detection.ts`
- `compaction-guard.ts`
- `session-state.ts`
- `todo.ts`

這些檔案主要是純邏輯與狀態處理，可作為新 repo 的核心基礎。

### Needs Adapter or Shim

- `types.ts`
- `constants.ts`
- `pending-question-detection.ts`
- `stagnation-detection.ts`
- `non-idle-events.ts`
- `resolve-message-info.ts`
- `message-directory.ts`

這些檔案的演算法可保留，但外部依賴需改成新 repo 的抽象介面。

### Should Be Rewritten in Minimal Form

- `index.ts`
- `handler.ts`
- `idle-event.ts`
- `continuation-injection.ts`
- `countdown.ts`

原因是它們最綁宿主 runtime、plugin wiring、訊息注入與 UI / scheduler 整合。直接複製會把大量舊框架耦合拖進新 repo。

## Event Flow

第一版只專注在 continuation 主線：

1. plugin 收到事件
2. 只處理 continuation 相關事件：
   - `session.idle`
   - `session.error`
   - `session.compacted`（若宿主支援）
   - `session.deleted` 或 session 清理事件（若宿主支援）
3. 在 `session.idle` 執行 eligibility checks
4. 通過後啟動 2 秒 countdown
5. countdown 結束前再做一次快速確認
6. 注入 continuation prompt
7. 更新 session state

## Idle Eligibility Checks

必須全部通過才允許 continuation：

- todo 仍有未完成項目
- 沒有 pending question
- 最近沒有 abort
- 不在 cooldown
- 不在 recovering
- 沒有 running background task
- agent 不在 skip list
- 沒有 compaction guard 擋住

## Session State

每個 session 至少維護以下狀態：

- `isRecovering`
- `abortDetectedAt`
- `countdownTimer`
- `countdownInterval`
- `countdownStartedAt`
- `lastIncompleteCount`
- `lastInjectedAt`
- `awaitingPostInjectionProgressCheck`
- `inFlight`
- `stagnationCount`
- `consecutiveFailures`
- `recentCompactionAt`
- `recentCompactionEpoch`
- `acknowledgedCompactionEpoch`

## Continuation Prompt Strategy

新 repo 會保留原有語義：

- 系統指出仍有 incomplete todos
- 要求 agent 直接繼續工作
- 不要停下來，直到 todo 完成
- 若 agent 認為已完成，需重新檢查並更新 todo 狀態

`CONTINUATION_PROMPT` 不再依賴舊 repo 的 `shared/system-directive`，而是在新 repo 內提供最小等價實作。

## Error Handling

- 取 todos 失敗：記錄 log，跳過本輪 continuation
- 解析最近訊息失敗：允許 fallback，但不能破壞 session
- inject 失敗：增加 `consecutiveFailures`
- session 結束 / 刪除：清理 timer 與狀態
- compaction 後 agent 無法解析：由 compaction guard 防止誤注入

第一版原則是「失敗時寧可跳過，不要誤注入」。

## Testing Strategy

### Unit Tests

覆蓋純邏輯：

- `todo.ts`
- `abort-detection.ts`
- `compaction-guard.ts`
- `idle-decision` 類型的主判定函式

### Lightweight Integration Tests

使用 fake adapters 驗證主流程：

- `session.idle` + incomplete todo -> countdown -> inject
- pending question -> 不 inject
- cooldown -> 不 inject
- skip agent -> 不 inject
- background task running -> 不 inject
- inject 失敗 -> `consecutiveFailures` 增加

第一版不要求完整端到端宿主整合測試。

## Proposed Repository Layout

```text
todo-continuation-enforcer/
├── package.json
├── tsconfig.json
├── README.md
├── .claude-plugin/
│   └── plugin.json
├── src/
│   ├── index.ts
│   ├── plugin/
│   │   ├── create-plugin.ts
│   │   ├── event-handler.ts
│   │   └── adapters/
│   │       ├── session-api.ts
│   │       ├── background-task-probe.ts
│   │       ├── message-store.ts
│   │       └── logger.ts
│   ├── todo-continuation-enforcer/
│   │   ├── index.ts
│   │   ├── handler.ts
│   │   ├── idle-event.ts
│   │   ├── continuation-injection.ts
│   │   ├── countdown.ts
│   │   ├── session-state.ts
│   │   ├── todo.ts
│   │   ├── abort-detection.ts
│   │   ├── compaction-guard.ts
│   │   ├── pending-question-detection.ts
│   │   ├── stagnation-detection.ts
│   │   ├── resolve-message-info.ts
│   │   ├── constants.ts
│   │   └── types.ts
│   └── shared/
│       └── system-directive.ts
└── tests/
    ├── unit/
    └── integration/
```

## Success Criteria

第一版完成時，應滿足：

- plugin 可在本地被載入
- idle 且存在 incomplete todo 時，會自動進入 continuation 流程
- pending question / abort / cooldown / skip agent / running background task 等條件下，不會誤觸發注入
- 具備基本測試覆蓋核心決策流程

## Risks and Mitigations

### Risk: Hidden host dependencies

原功能深度依賴 `oh-my-openagent` 的 shared 與 feature 模組。

Mitigation:

- 先隔離 adapter 介面
- 對整合點採最小重寫
- 優先保住 decision logic，而非逐行搬運 runtime glue

### Risk: Behavior drift from original implementation

Mitigation:

- 以原模組常數、狀態欄位與 decision gate 為基準
- 對關鍵情境補 integration tests

### Risk: Over-generalizing too early

Mitigation:

- 第一版只保留必要設定
- 不先抽象成通用 continuation framework

## Open Decisions Resolved

- 採用方案 A：最小依賴抽離成真正獨立 plugin
- 新 repo 直接使用 `workspace2/todo-continuation-enforcer`
- 第一版完成標準為「可本地載入 + 基本測試」

## Implementation Planning Readiness

此設計已足夠進入 implementation planning。下一步應將工作拆成：

1. 專案骨架與 plugin 入口
2. adapters 定義與最小宿主接線
3. continuation feature 搬移 / 改寫
4. 測試建立與驗證
