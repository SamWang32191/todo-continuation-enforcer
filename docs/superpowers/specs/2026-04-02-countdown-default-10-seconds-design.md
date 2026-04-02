# Countdown Default 10 Seconds Design

## Summary

將 `todo-continuation-enforcer` 的預設 countdown 從 5 秒調整為 10 秒，並同步更新 README 與反映預設/文案的測試，讓 repo 對外描述、預設行為與驗證保持一致。

## Goals

- 將 plugin 預設 `countdownSeconds` 改為 10 秒
- 更新與預設 countdown 文案對齊的測試
- 在 README 明確寫出預設 countdown 為 10 秒

## Non-Goals

- 不改變呼叫端顯式傳入 `countdownSeconds` 時的覆寫能力
- 不重構 countdown 架構或 timer 實作
- 不批次修改所有僅作為測試情境值的非預設秒數案例

## Chosen Approach

採用最小變更：

1. 將 `src/plugin/create-plugin.ts` 的 fallback 值由 `5` 改為 `10`
2. 調整驗證預設 countdown 文案的整合測試，讓預期值改為 10 秒倒數
3. 在 README 補上「預設 countdown 為 10 秒，可透過 `countdownSeconds` 覆寫」的使用說明

## Architecture Impact

### 1. Default Option Wiring

`createPlugin(options?: { countdownSeconds?: number })` 目前在未提供值時使用 `5`。此設計只修改 fallback 常數，不更動 API shape，因此既有明確傳入值的呼叫端不受影響。

### 2. Test Alignment

目前整合測試已有明確驗證 5 秒 countdown toast 文案。這類測試需改為 10 秒版本，包含測試名稱、模擬推進秒數與預期 toast 陣列，避免測試仍綁定舊預設。

### 3. Documentation Alignment

README 目前未明說預設 countdown 秒數。新增簡短說明可讓使用者知道：

- 預設會等待 10 秒
- 可透過 `createPlugin({ countdownSeconds })` 或等價設定覆寫

## File Impact Plan

### Must Change

- `src/plugin/create-plugin.ts`
- `tests/integration/todo-continuation-enforcer.integration.test.ts`
- `README.md`

### Likely No Change

- `src/todo-continuation-enforcer/countdown.ts`
- `src/todo-continuation-enforcer/handler.ts`
- 其他使用非預設秒數作為特定測試情境的檔案

## Testing Strategy

- 更新整合測試，驗證 10 秒 countdown 期間的 toast 文案與完成後 inject
- 保留其他顯式傳入 `0`、`0.05`、`5` 秒等測試案例，因其目的在覆蓋特定情境，而非驗證預設值
- 執行 typecheck 與 test，確認變更未破壞既有行為

## Success Criteria

- 未提供 `countdownSeconds` 時，plugin 預設使用 10 秒
- README 與測試內容不再描述 5 秒為預設值
- 顯式傳入秒數的行為維持不變
