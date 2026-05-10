import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { setTelegramEnabled, setTelegramEventEnabled } from "./tui-config"

const testConfigDir = join(homedir(), ".config", "opencode-tui-config-test")
const testConfigPath = join(testConfigDir, "opencode-notifier.json")

function cleanupTestConfig() {
  if (existsSync(testConfigDir)) {
    rmSync(testConfigDir, { recursive: true, force: true })
  }
}

describe("TUI config writes", () => {
  beforeEach(() => {
    process.env.OPENCODE_NOTIFIER_CONFIG_PATH = testConfigPath
    cleanupTestConfig()
    mkdirSync(testConfigDir, { recursive: true })
  })

  afterEach(() => {
    delete process.env.OPENCODE_NOTIFIER_CONFIG_PATH
    cleanupTestConfig()
  })

  test("does not overwrite malformed JSON when toggling Telegram", () => {
    writeFileSync(testConfigPath, "not json")

    expect(() => setTelegramEnabled(true)).toThrow()
    expect(readFileSync(testConfigPath, "utf-8")).toBe("not json")
  })

  test("does not overwrite non-object JSON when toggling an event", () => {
    writeFileSync(testConfigPath, "[]")

    expect(() => setTelegramEventEnabled("complete", true)).toThrow()
    expect(readFileSync(testConfigPath, "utf-8")).toBe("[]")
  })
})
