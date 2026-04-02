# Prompt String Readability Design

## Summary

改善 `todo-continuation-enforcer` 內 prompt 字串在 TypeScript 原始碼中的可讀性，避免以大量 `\n\n` 直接拼接長字串；此次調整只重構程式碼中的組裝方式，不改變實際 inject 到 session 的 prompt 內容。

## Goals

- 讓 `CONTINUATION_PROMPT` 的原始碼更容易閱讀與維護
- 讓 continuation injection 的字串組裝區塊化
- 保持目前 inject 出去的 prompt 文字完全一致
- 盡量降低測試與行為回歸風險

## Non-Goals

- 不重新設計 continuation prompt 文案
- 不新增複雜的 prompt builder abstraction
- 不改動 `createSystemDirective()` 的格式或責任
- 不改變 `Remaining todos:` 與 todo 項目的輸出格式

## Chosen Approach

採用「分段陣列組裝 + join」的最小重構方式：

1. 在 `src/todo-continuation-enforcer/constants.ts` 中，把 `CONTINUATION_PROMPT` 從單一長 template literal 改為明確段落陣列組裝
2. 在 `src/todo-continuation-enforcer/continuation-injection.ts` 中，把 prompt 主體、`Remaining todos:` 標頭、todo 清單拆成數個區塊，再用 `join("\n\n")` 或 `join("\n")` 組裝
3. 保持輸出字串逐字一致，讓現有測試可以繼續作為回歸保護

## Alternatives Considered

### 1. 小型 prompt builder 函式

可將 `CONTINUATION_PROMPT` 與 inject 流程包進 builder function，語意更完整；但這次目標只是改善 TS 可讀性，增加抽象層會讓改動大於收益。

### 2. 多行 template literal 搭配 trim / dedent

視覺上接近最終輸出，但容易因縮排、尾端空白或 trim 規則影響字串內容；對已有精確字串測試的 repo 來說風險較高。

## Design Details

### 1. `CONTINUATION_PROMPT` 改為分段組裝

目前 `constants.ts` 直接以單一 template literal 夾帶多個 `\n\n` 組裝 prompt。改動後，會將內容拆成：

- system directive 行
- question tool 指令段落
- continuation 行為指令段落

這些段落會以陣列表示，再使用 `join("\n\n")` 或內外層 join 組裝。這樣可以保留原本文字與空行數量，同時讓每一段語意清楚可見。

### 2. `injectContinuation()` 改為區塊化組裝

目前 `continuation-injection.ts` 以單一 template literal 直接把 `CONTINUATION_PROMPT`、`Remaining todos:`、todo 清單接起來。改動後會拆成：

- prompt body
- remaining todos heading
- rendered todo list

最終再組成完整 prompt。這可讓閱讀者快速看出注入內容的結構，而不是在單行字串中辨識換行符號。

### 3. 保持輸出一致

這次改動的核心約束是「只改 TypeScript 可讀性，不改 inject 內容」。因此需特別注意：

- 段落之間仍維持相同空行數
- list item 的 `- [status] content` 格式不變
- `Remaining todos:` 前後換行不變
- 空 todo 清單時的既有行為不在此次變更範圍內

## File Impact Plan

### Must Change

- `src/todo-continuation-enforcer/constants.ts`
- `src/todo-continuation-enforcer/continuation-injection.ts`

### Likely No Change

- `src/shared/system-directive.ts`
- `src/todo-continuation-enforcer/handler.ts`

### Tests to Verify

- `tests/unit/constants.test.ts`
- `tests/unit/continuation-injection.test.ts`

## Testing Strategy

### Unit Tests

- 確認 `CONTINUATION_PROMPT` 仍等於既有預期字串
- 確認 continuation injection 組出的 prompt 仍包含相同段落與 todo 清單格式

### Verification

- 執行既有單元測試，確認純重構未改變 prompt 內容
- 若測試使用硬編碼字串，僅在必要時做最小同步，避免把結構重構擴大成文案變更

## Success Criteria

- `constants.ts` 不再以大量內嵌 `\n\n` 維護長 prompt 字串
- `continuation-injection.ts` 的 prompt 組裝可直接從程式碼看出區塊結構
- inject 出去的 prompt 內容與現況一致
- 現有 prompt 相關測試持續通過
