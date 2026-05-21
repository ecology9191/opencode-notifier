import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import {
  setTelegramAuthorizedChatIds,
  setTelegramAuthorizedUserIds,
  setTelegramBotToken,
  setTelegramEnabled,
  setTelegramEventEnabled,
  setTelegramLongPolling,
} from "./tui-config"

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

  test("writes a valid Telegram bot token to JSON", () => {
    setTelegramBotToken("123456:test-token")

    const config = JSON.parse(readFileSync(testConfigPath, "utf-8"))
    expect(config.telegram.botToken).toBe("123456:test-token")
  })

  test("rejects invalid Telegram bot tokens", () => {
    expect(() => setTelegramBotToken("not a token")).toThrow()
  })

  test("clears the Telegram bot token", () => {
    writeFileSync(testConfigPath, JSON.stringify({ telegram: { botToken: "123456:test-token" } }))

    setTelegramBotToken(null)

    const config = JSON.parse(readFileSync(testConfigPath, "utf-8"))
    expect(config.telegram.botToken).toBe(null)
  })

  test("writes Telegram allowlists and long polling", () => {
    setTelegramLongPolling(false)
    setTelegramAuthorizedUserIds([123, 456])
    setTelegramAuthorizedChatIds([-1001234567890])

    const config = JSON.parse(readFileSync(testConfigPath, "utf-8"))
    expect(config.telegram.longPolling).toBe(false)
    expect(config.telegram.authorizedUserIds).toEqual([123, 456])
    expect(config.telegram.authorizedChatIds).toEqual([-1001234567890])
  })
})
