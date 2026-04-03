---
+id: opencode-plugin-design-should-check-local-installed-types
+date: 2026-04-03
+scope: project
+tags: [opencode, plugin, sdk, types, version]
+source: user-correction
+confidence: 0.7
+related: [[plugin-tool-context-missing-session-id]]
---

+# 設計 OpenCode plugin 前要先檢查本地 `.opencode/node_modules` 的實際型別

+## Context
+在這個 repo 討論 continuation stop/cancel 重構時，只看文件或 package version 容易誤判目前 host 真正支援的 hook 與 tool context。

+## Mistake
+如果沒有先讀當前工作目錄下 `.opencode/node_modules/@opencode-ai/*/dist/*.d.ts` 與實際匯出，就可能錯判像 `chat.message`、`ToolContext.sessionID` 這種能力是否存在，進而讓設計建立在錯誤前提上。

+## Lesson
+- 對 OpenCode plugin / SDK 能力判斷，優先讀目前 workspace 內 `.opencode/node_modules/@opencode-ai` 的實際安裝版本與型別宣告。
+- 根目錄 `package.json` 的 semver 與外部文件只能當輔助，不應取代本地已安裝 runtime/types 的確認。
+- 若設計依賴 hook、tool context、或 SDK endpoint，討論前至少確認一次對應 `dist/*.d.ts`。

+## When to Apply
+當這個 repo 要新增或重構 OpenCode plugin hook、tool、event 流程，且設計是否可行取決於目前安裝版本的實際 API 能力時。
