import { describe, expect, it } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

function extractRunBlock(workflowText: string, stepName: string) {
  const lines = workflowText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)

  if (startIndex === -1) {
    throw new Error(`Could not find step: ${stepName}`)
  }

  const runIndex = lines.slice(startIndex).findIndex((line) => line.trim() === "run: |")
  if (runIndex === -1) {
    throw new Error(`Could not find run block for step: ${stepName}`)
  }

  const runLine = lines[startIndex + runIndex]
  const runIndent = runLine.length - runLine.trimStart().length
  const scriptLines: string[] = []
  for (let index = startIndex + runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const lineIndent = line.length - line.trimStart().length
    if (line.trimStart().startsWith("- name: ") && lineIndent <= runIndent) {
      break
    }

    scriptLines.push(line.slice(runIndent + 2))
  }

  return scriptLines.join("\n").trimEnd()
}

describe("release workflow regressions", () => {
  it("Read package metadata step 能成功寫出 package metadata", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Read package metadata")

    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))
    try {
      const scriptPath = join(tempDir, "read-package-metadata.sh")
      const outputPath = join(tempDir, "github-output.txt")
      const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string }

      writeFileSync(scriptPath, `${runBlock}\n`)
      writeFileSync(outputPath, "")

      const result = spawnSync("bash", [scriptPath], {
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(readFileSync(outputPath, "utf8")).toBe(`package_name=${packageJson.name}\ncurrent_version=${packageJson.version}\n`)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("Publish to npm step 會清理 auth 且不覆寫 userconfig", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Publish to npm")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "publish-to-npm.sh")
      const fakeBinDir = join(tempDir, "bin")
      const callLogPath = join(tempDir, "calls.jsonl")

      mkdirSync(fakeBinDir)
      writeFileSync(
        join(fakeBinDir, "npm"),
        `#!/usr/bin/env node
const fs = require('node:fs')
const logPath = process.env.CALL_LOG_PATH
if (!logPath) throw new Error('CALL_LOG_PATH is required')
fs.appendFileSync(
  logPath,
  JSON.stringify({
    tool: 'npm',
    argv: process.argv.slice(2),
    NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? '__UNSET__',
    NPM_TOKEN: process.env.NPM_TOKEN ?? '__UNSET__',
    NPM_CONFIG_USERCONFIG: process.env.NPM_CONFIG_USERCONFIG ?? '__UNSET__',
    npm_config_userconfig: process.env.npm_config_userconfig ?? '__UNSET__',
  }) + '\\n',
)
`,
      )
      writeFileSync(
        join(fakeBinDir, "rm"),
        `#!/usr/bin/env node
const fs = require('node:fs')
const logPath = process.env.CALL_LOG_PATH
if (!logPath) throw new Error('CALL_LOG_PATH is required')
fs.appendFileSync(
  logPath,
  JSON.stringify({
    tool: 'rm',
    argv: process.argv.slice(2),
  }) + '\\n',
)
`,
      )
      chmodSync(join(fakeBinDir, "npm"), 0o755)
      chmodSync(join(fakeBinDir, "rm"), 0o755)
      writeFileSync(scriptPath, `${runBlock}\n`)

      const result = spawnSync("bash", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH}`,
          CALL_LOG_PATH: callLogPath,
          NODE_AUTH_TOKEN: "parent-node-auth-token",
          NPM_TOKEN: "parent-npm-token",
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")

      expect(runBlock).toMatch(/unset\s+NODE_AUTH_TOKEN\s+NPM_TOKEN/)
      expect(runBlock).toMatch(/unset\s+NPM_CONFIG_USERCONFIG\s+npm_config_userconfig/)

      const calls = readFileSync(callLogPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {
          tool: string
          argv: string[]
          NODE_AUTH_TOKEN?: string
          NPM_TOKEN?: string
          NPM_CONFIG_USERCONFIG?: string
          npm_config_userconfig?: string
        })

      const publishCallIndex = calls.findIndex(
        (call) => call.tool === "npm" && call.argv[0] === "publish",
      )
      const configDeleteCallIndex = calls.findIndex(
        (call) => call.tool === "npm" && call.argv[0] === "config" && call.argv[1] === "delete" && call.argv[2] === "//registry.npmjs.org/:_authToken",
      )
      const homeNpmrc = `${process.env.HOME ?? ""}/.npmrc`
      const rmCallIndex = calls.findIndex(
        (call) => call.tool === "rm" && call.argv.length === 3 && call.argv[0] === "-f" && call.argv[1] === homeNpmrc && call.argv[2] === ".npmrc",
      )

      const publishCall = calls[publishCallIndex]

      expect({
        cleanupBeforePublish: configDeleteCallIndex !== -1 && rmCallIndex !== -1 && configDeleteCallIndex < publishCallIndex && rmCallIndex < publishCallIndex,
        publishArgs: publishCall?.argv.join(" ") ?? null,
        publishEnv: {
          NODE_AUTH_TOKEN: publishCall?.NODE_AUTH_TOKEN ?? "__UNSET__",
          NPM_TOKEN: publishCall?.NPM_TOKEN ?? "__UNSET__",
          NPM_CONFIG_USERCONFIG: publishCall?.NPM_CONFIG_USERCONFIG ?? "__UNSET__",
          npm_config_userconfig: publishCall?.npm_config_userconfig ?? "__UNSET__",
        },
      }).toEqual({
        cleanupBeforePublish: true,
        publishArgs: "publish --provenance --access public --registry=https://registry.npmjs.org/",
        publishEnv: {
          NODE_AUTH_TOKEN: "__UNSET__",
          NPM_TOKEN: "__UNSET__",
          NPM_CONFIG_USERCONFIG: "__UNSET__",
          npm_config_userconfig: "__UNSET__",
        },
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
