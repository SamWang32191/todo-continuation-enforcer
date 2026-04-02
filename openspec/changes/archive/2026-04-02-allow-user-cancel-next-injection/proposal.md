## Why

當 continuation countdown 已開始時，系統目前只會在內部事件（例如 error、compaction、session deletion）發生時取消下一次 prompt 注入，使用者無法主動取消。這讓使用者在倒數期間改變主意時，仍可能被自動注入下一個 prompt，因此需要補上明確的使用者取消控制。

## What Changes

- 新增使用者可主動取消目前 countdown 與下一次 continuation prompt 注入的能力。
- 讓取消操作在 countdown 尚未結束時立即生效，並阻止後續 `injectPrompt` 流程。
- 將使用者主動取消整合到既有 countdown/state 管理流程，與既有的 error、compaction、deletion 取消邏輯一致。
- 提供對應的使用者互動/入口與狀態回饋，讓使用者知道下一次注入已被取消。

## Capabilities

### New Capabilities
- `continuation-cancellation`: 定義使用者在 countdown 期間主動取消下一次 continuation 注入的行為、限制與結果。

### Modified Capabilities

## Impact

- Affected code: `src/todo-continuation-enforcer/countdown.ts`, `src/todo-continuation-enforcer/handler.ts`, `src/todo-continuation-enforcer/session-state.ts`
- Likely affected plugin surfaces/adapters for exposing a user-triggered cancel action and user feedback
- Affected behavior: countdown lifecycle, continuation injection eligibility, and cancellation state handling
- No expected external dependency changes
