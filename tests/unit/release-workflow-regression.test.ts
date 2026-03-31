import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
})
