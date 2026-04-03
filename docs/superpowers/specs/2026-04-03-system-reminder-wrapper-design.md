# System Reminder Wrapper Design

## Summary

調整 `todo-continuation-enforcer` 注入到 session 的 continuation prompt，讓整段注入內容外層包上 `<system-reminder>...</system-reminder>`，同時保留既有內部 directive `[TODO_CONTINUATION]`、QUESTION TOOL 指令與 `Remaining todos:` 清單格式不變。

## Goals

- 讓最終 inject 的 continuation prompt 外層帶有 `<system-reminder>` 包裝
- 保留內部 `[TODO_CONTINUATION]` 與既有 prompt 文案
- 將影響面限制在 continuation injection 路徑
- 以測試保護完整輸出格式，避免空行或清單格式回歸

## Non-Goals

- 不將 `createSystemDirective()` 全面改成 XML 風格
- 不移除或重命名 `[TODO_CONTINUATION]`
- 不修改 `Remaining todos:` 標頭或 todo item 渲染格式
- 不重構與本次需求無關的 plugin、handler、stop guard 流程

## Chosen Approach

採用「只包最終注入字串」的最小變更方式：

1. 保持 `src/todo-continuation-enforcer/constants.ts` 中 `CONTINUATION_PROMPT` 內容不變
2. 在 `src/todo-continuation-enforcer/continuation-injection.ts` 中，將原本組好的完整 prompt 以 `<system-reminder>` 與 `</system-reminder>` 包起來
3. 更新單元測試驗證精確輸出，整合測試則優先引用共用常數或僅驗證 integration layer 責任

## Alternatives Considered

### 1. 修改 `createSystemDirective()` 為 XML 格式

可以讓 directive 格式統一，但會把單一 continuation 需求擴大成 shared utility 變更，增加未知影響面與測試調整範圍。

### 2. 在 `constants.ts` 直接把 `CONTINUATION_PROMPT` 內建 `<system-reminder>`

實作也可行，但會讓共享 prompt 常數同時承擔「內容」與「注入外層容器」兩種責任，降低語意清楚度；把 wrapper 放在 injection 點較符合實際行為邊界。

### 3. 新增通用 wrapper helper

若後續還有其他 reminder 類 prompt 需要同格式包裝，抽 helper 會有價值；但目前只有單一路徑使用，先保持最小抽象較合適。

## Design Details

### 1. Wrapper 邊界

`<system-reminder>` 應包住「整段最終注入內容」，也就是：

- `[TODO_CONTINUATION]`
- QUESTION TOOL 指令段落
- continuation 行為指令段落
- `Remaining todos:` 標頭
- 各個 todo list item

這代表 wrapper 應在 `injectContinuation()` 完成所有字串組裝後再加上，而不是只包 `CONTINUATION_PROMPT` 常數本身。

### 2. 保持內部 directive 不變

使用者已確認要保留 `[TODO_CONTINUATION]`。因此內部 prompt contract 不變，僅新增外層 XML tag。這可避免影響任何可能依賴該 directive 文案的既有流程，同時滿足新的包裝需求。

### 3. 換行與格式約束

本次最容易回歸的是字串換行。最終輸出需符合：

1. 第一行是 `<system-reminder>`
2. 第二行開始是既有 continuation prompt 內容
3. todo 清單維持目前 `- [status] content` 格式
4. 最後一行是 `</system-reminder>`

除了新增外層 opening / closing tag，不應再改變其他段落之間的空行數。

## File Impact Plan

### Must Change

- `src/todo-continuation-enforcer/continuation-injection.ts`
- `tests/unit/continuation-injection.test.ts`

### Likely Change

- `tests/unit/constants.test.ts`（若測試責任需要重新界定或新增 wrapper 常數）
- `tests/integration/todo-continuation-enforcer.integration.test.ts`

### Likely No Change

- `src/shared/system-directive.ts`
- `src/todo-continuation-enforcer/constants.ts`
- `src/todo-continuation-enforcer/handler.ts`

## Testing Strategy

### Unit Tests

- 驗證 `injectContinuation()` 送進 `sessionApi.injectPrompt()` 的完整字串外層包含 `<system-reminder>` wrapper
- 驗證 wrapper 內仍保有 `[TODO_CONTINUATION]` 與既有 todo 清單內容

### Integration Tests

- 驗證 idle flow 成功注入時，注入內容含有 `<system-reminder>` 包裝
- 若整合測試需要比對共享文案，優先引用匯出常數，避免重複硬編碼 prompt 內容

### Verification

- 執行 prompt 相關單元測試與整合測試
- 執行 `lsp_diagnostics` 檢查修改檔案沒有型別或語法錯誤

## Success Criteria

- continuation prompt 的最終注入內容被 `<system-reminder>` 完整包住
- `[TODO_CONTINUATION]` 與既有文字內容保持不變
- 測試能保護 wrapper 與換行格式
- 變更範圍維持在 continuation injection 與相關測試
