# Release workflow npm auth regression design

## Summary

修正 `todo-continuation-enforcer` 的 GitHub Actions `Release` workflow 在 `Publish to npm` 步驟出現 `ENEEDAUTH` 的回歸。設計目標是讓 publish 流程對齊參考 repo `/Users/samwang/Repo/oh-my-opencode-medium` 的 trusted publishing 清理方式，避免本地或 runner 上殘留的 npm auth 設定干擾 GitHub OIDC 發布。

## Problem

- 最新失敗 run 停在 `.github/workflows/release.yml` 的 `Publish to npm`
- 失敗訊息為 `npm error code ENEEDAUTH`
- 現行流程在 publish 前會建立暫時 `NPM_CONFIG_USERCONFIG`，只寫入 `registry=` 後再執行 `npm publish --provenance`
- 官方 npm trusted publishing 文件指出，GitHub Actions OIDC 路徑不需要長效 npm token；而參考 repo 也沒有覆寫 `userconfig`，而是直接清掉干擾性的 auth 設定後 publish

## Goals

- 讓 release workflow 的 npm publish 路徑與參考 repo 一致
- 保留 GitHub Actions OIDC trusted publishing / provenance 設計
- 補一個 regression test，避免之後又引入 `NPM_CONFIG_USERCONFIG` 型態的 publish 回歸

## Non-goals

- 不改 release 的整體順序（仍維持 `publish -> atomic push -> gh release create`）
- 不改版本驗證、tag 檢查、build/test/typecheck 等既有 release gate
- 不改成 token-based npm publish fallback

## Proposed change

只調整 `.github/workflows/release.yml` 的 `Publish to npm` 步驟。

### Before

- `unset NODE_AUTH_TOKEN NPM_TOKEN`
- 對 repo-level `.npmrc` 的 auth token 設定做 fail-fast
- 建立暫時 `NPM_CONFIG_USERCONFIG`
- 將 `npm_config_userconfig` 指向只含 `registry=` 的暫存檔
- 執行 `npm publish --provenance --access public --registry=https://registry.npmjs.org/`

### After

- `unset NODE_AUTH_TOKEN NPM_TOKEN`
- `unset NPM_CONFIG_USERCONFIG npm_config_userconfig`
- `npm config delete //registry.npmjs.org/:_authToken || true`
- `rm -f ~/.npmrc .npmrc || true`
- 直接執行 `npm publish --provenance --access public --registry=https://registry.npmjs.org/`

## Rationale

1. 參考 repo `oh-my-opencode-medium` 已用這個模式成功走 trusted publishing。
2. npm 官方文件指出 OIDC trusted publishing 不需要長效 token，npm CLI 會在 OIDC 環境自動偵測並使用該路徑。
3. 現行 `NPM_CONFIG_USERCONFIG` 覆寫雖然理論上不一定會破壞 OIDC，但它是這次 regression 與參考實作之間最可疑的差異點，且沒有明顯必要性。
4. 把清理手段收斂到刪除 token 與 `.npmrc`，更容易理解，也更接近「排除殘留 npm auth 汙染」這個實際目標。
5. 額外 `unset NPM_CONFIG_USERCONFIG` / `npm_config_userconfig` 能防止 runner 或上層環境殘留的 userconfig 路徑繼續污染 trusted publishing。

## Testing

更新 `tests/unit/release-workflow-regression.test.ts`，至少覆蓋：

- workflow 仍包含 `npm publish --provenance --access public --registry=https://registry.npmjs.org/`
- publish 前會 `unset NODE_AUTH_TOKEN NPM_TOKEN`
- publish 前會 `unset NPM_CONFIG_USERCONFIG npm_config_userconfig`
- publish 前會 `npm config delete //registry.npmjs.org/:_authToken || true`
- publish 前會 `rm -f ~/.npmrc .npmrc || true`
- workflow 不再建立或透過環境殘留使用 `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig`

## Risks and mitigations

- **風險：npm trusted publisher 本身沒配好**
  - 這種情況下 workflow 仍會失敗，但失敗會正確指向外部設定，而不是本 repo shell 邏輯。
- **風險：刪除 `.npmrc` 影響後續步驟**
  - 這段清理只位於 publish 步驟內，且它已經是 release job 後段，對前面的 install / build / test 不產生影響。
- **風險：失去 repo-level `.npmrc` fail-fast 訊號**
  - 改成直接刪除是刻意對齊參考 repo，優先確保 trusted publishing 路徑單純可用。

## Success criteria

- release workflow shell 邏輯與參考 repo 的 publish 清理模式一致
- regression test 明確保護新的清理邏輯
- 後續手動 dispatch release 時，不再因 `ENEEDAUTH` 卡在這個 shell 寫法
