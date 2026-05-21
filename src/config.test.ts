import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const testConfigDir = join(homedir(), ".config", "opencode-test")
const testConfigPath = join(testConfigDir, "opencode-notifier.json")
const testLegacyEnvPath = join(testConfigDir, "opencode-notifier.env")

function setTestEnv() {
  process.env.OPENCODE_NOTIFIER_CONFIG_PATH = testConfigPath
}

function unsetTestEnv() {
  delete process.env.OPENCODE_NOTIFIER_CONFIG_PATH
}

function cleanupTestConfig() {
  if (existsSync(testConfigPath)) {
    rmSync(testConfigPath, { force: true })
  }
  if (existsSync(testConfigDir)) {
    rmSync(testConfigDir, { recursive: true, force: true })
  }
}

describe("Config", () => {
  beforeAll(() => {
    setTestEnv()
    mkdirSync(testConfigDir, { recursive: true })
  })

  afterAll(() => {
    unsetTestEnv()
    cleanupTestConfig()
  })

  beforeEach(() => {
    cleanupTestConfig()
    mkdirSync(testConfigDir, { recursive: true })
  })

  afterEach(() => {
    cleanupTestConfig()
  })

  test("loadConfig returns default config when no config file exists", async () => {
    const { loadConfig } = await import("./config")
    const config = loadConfig()
    
    expect(config.sound).toBe(true)
    expect(config.notification).toBe(true)
    expect(config.bell).toBe(false)
    expect(config.timeout).toBe(5)
    expect(config.showProjectName).toBe(true)
    expect(config.showIcon).toBe(true)
    expect(config.notificationSystem).toBe("osascript")
    expect(config.telegram.enabled).toBe(false)
    expect(config.telegram.botToken).toBe(null)
    expect(config.telegram.longPolling).toBe(true)
    expect(config.telegram.authorizedUserIds).toEqual([])
    expect(config.telegram.authorizedChatIds).toEqual([])
  })

  test("loadConfig parses existing config file with Telegram secrets in JSON", async () => {
    const testConfig = {
      sound: false,
      notification: true,
      bell: true,
      timeout: 10,
      telegram: {
        enabled: true,
        botToken: "123456:json-token",
        longPolling: false,
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.sound).toBe(false)
    expect(config.notification).toBe(true)
    expect(config.bell).toBe(true)
    expect(config.timeout).toBe(10)
    expect(config.telegram.enabled).toBe(true)
    expect(config.telegram.botToken).toBe("123456:json-token")
    expect(config.telegram.longPolling).toBe(false)
  })

  test("loadConfig parses Telegram allowlists from JSON arrays", async () => {
    const testConfig = {
      telegram: {
        authorizedUserIds: [123, 456, 0, 9007199254740992],
        authorizedChatIds: [-1001234567890, 42, 42, 0],
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.authorizedUserIds).toEqual([123, 456])
    expect(config.telegram.authorizedChatIds).toEqual([-1001234567890, 42])
  })

  test("loadConfig rejects invalid Telegram bot tokens in JSON", async () => {
    writeFileSync(testConfigPath, JSON.stringify({
      telegram: {
        botToken: "not a token",
      },
    }))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.botToken).toBe(null)
  })

  test("loadConfig keeps empty Telegram allowlists when JSON arrays are empty", async () => {
    writeFileSync(testConfigPath, JSON.stringify({
      telegram: {
        authorizedUserIds: [],
        authorizedChatIds: [],
      },
    }))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.authorizedUserIds).toEqual([])
    expect(config.telegram.authorizedChatIds).toEqual([])
  })

  test("loadConfig migrates legacy opencode-notifier.env into JSON once", async () => {
    writeFileSync(testConfigPath, JSON.stringify({ telegram: { enabled: true } }))
    writeFileSync(
      testLegacyEnvPath,
      "TELEGRAM_BOT_TOKEN=123456:legacy-token\nTELEGRAM_LONG_POLLING=0\nTELEGRAM_AUTHORIZED_USER_IDS=123\nTELEGRAM_AUTHORIZED_CHAT_IDS=-1001234567890\n"
    )

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.botToken).toBe("123456:legacy-token")
    expect(config.telegram.longPolling).toBe(false)
    expect(config.telegram.authorizedUserIds).toEqual([123])
    expect(config.telegram.authorizedChatIds).toEqual([-1001234567890])

    const migratedConfig = JSON.parse(readFileSync(testConfigPath, "utf-8"))
    expect(migratedConfig.telegram.botToken).toBe("123456:legacy-token")
    expect(existsSync(testLegacyEnvPath)).toBe(false)
    expect(existsSync(`${testLegacyEnvPath}.migrated`)).toBe(true)
  })

  test("loadConfig migrates legacy Telegram env when JSON config is missing", async () => {
    writeFileSync(
      testLegacyEnvPath,
      "TELEGRAM_BOT_TOKEN=123456:legacy-token\nTELEGRAM_AUTHORIZED_USER_IDS=123\n"
    )

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.botToken).toBe("123456:legacy-token")
    expect(config.telegram.authorizedUserIds).toEqual([123])
    expect(existsSync(testConfigPath)).toBe(true)
    expect(existsSync(testLegacyEnvPath)).toBe(false)
    expect(existsSync(`${testLegacyEnvPath}.migrated`)).toBe(true)
  })

  test("loadConfig merges legacy Telegram env into partial JSON config", async () => {
    writeFileSync(testConfigPath, JSON.stringify({
      telegram: {
        botToken: "654321:json-token",
        authorizedUserIds: [456],
      },
    }))
    writeFileSync(
      testLegacyEnvPath,
      "TELEGRAM_BOT_TOKEN=123456:legacy-token\nTELEGRAM_LONG_POLLING=0\nTELEGRAM_AUTHORIZED_USER_IDS=123,456\nTELEGRAM_AUTHORIZED_CHAT_IDS=-1001234567890\n"
    )

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.telegram.botToken).toBe("654321:json-token")
    expect(config.telegram.longPolling).toBe(false)
    expect(config.telegram.authorizedUserIds).toEqual([456, 123])
    expect(config.telegram.authorizedChatIds).toEqual([-1001234567890])
    expect(existsSync(testLegacyEnvPath)).toBe(false)
    expect(existsSync(`${testLegacyEnvPath}.migrated`)).toBe(true)
  })

  test("loadConfig handles missing optional fields with defaults", async () => {
    const testConfig = {
      sound: false,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    
    const { loadConfig } = await import("./config")
    const config = loadConfig()
    
    expect(config.sound).toBe(false)
    expect(config.notification).toBe(true) // default
    expect(config.timeout).toBe(5) // default
  })

  test("loadConfig handles invalid JSON gracefully", async () => {
    writeFileSync(testConfigPath, "invalid json{")
    
    const { loadConfig } = await import("./config")
    const config = loadConfig()
    
    expect(config.sound).toBe(true) // default
    expect(config.notification).toBe(true) // default
  })

  test("loadConfig parses event-specific config", async () => {
    const testConfig = {
      sound: true,
      events: {
        complete: { sound: false, notification: true },
        error: { sound: true, notification: false, bell: true },
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    
    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled, isEventBellEnabled } = await import("./config")
    const config = loadConfig()
    
    expect(isEventSoundEnabled(config, "complete")).toBe(false)
    expect(isEventNotificationEnabled(config, "complete")).toBe(true)
    expect(isEventSoundEnabled(config, "error")).toBe(true)
    expect(isEventNotificationEnabled(config, "error")).toBe(false)
    expect(isEventBellEnabled(config, "error")).toBe(true)
  })

  test("loadConfig defaults event Telegram to notification defaults", async () => {
    const { loadConfig, isEventTelegramEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventTelegramEnabled(config, "permission")).toBe(true)
    expect(isEventTelegramEnabled(config, "subagent_complete")).toBe(false)
    expect(isEventTelegramEnabled(config, "user_cancelled")).toBe(false)
    expect(isEventTelegramEnabled(config, "session_started")).toBe(false)
    expect(isEventTelegramEnabled(config, "user_message")).toBe(false)
    expect(isEventTelegramEnabled(config, "client_connected")).toBe(false)
  })

  test("loadConfig parses per-event Telegram overrides", async () => {
    const testConfig = {
      events: {
        complete: { telegram: false },
        user_message: { telegram: true },
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventTelegramEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventTelegramEnabled(config, "complete")).toBe(false)
    expect(isEventTelegramEnabled(config, "user_message")).toBe(true)
  })

  test("loadConfig ignores non-boolean per-event Telegram overrides", async () => {
    const testConfig = {
      events: {
        complete: { telegram: "false" },
        user_message: { telegram: "true" },
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventTelegramEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventTelegramEnabled(config, "complete")).toBe(true)
    expect(isEventTelegramEnabled(config, "user_message")).toBe(false)
  })

  test("loadConfig keeps bell disabled for boolean event shorthand", async () => {
    const testConfig = {
      events: {
        complete: true,
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventBellEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventBellEnabled(config, "complete")).toBe(false)
  })

  test("loadConfig inherits bell from global config", async () => {
    const testConfig = {
      bell: true,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventBellEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventBellEnabled(config, "permission")).toBe(true)
    expect(isEventBellEnabled(config, "complete")).toBe(true)
  })

  test("loadConfig defaults user_cancelled to silent", async () => {
    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "user_cancelled")).toBe(false)
    expect(isEventNotificationEnabled(config, "user_cancelled")).toBe(false)
    expect(config.messages.user_cancelled).toBe("Session was cancelled by user: {sessionTitle}")
    expect(isEventSoundEnabled(config, "plan_exit")).toBe(true)
    expect(isEventNotificationEnabled(config, "plan_exit")).toBe(true)
    expect(config.messages.plan_exit).toBe("Plan ready for review: {sessionTitle}")
  })

  test("loadConfig parses plan_exit event config from file", async () => {
    const testConfig = {
      events: {
        plan_exit: { sound: false, notification: true, command: false },
      },
      messages: {
        plan_exit: "Plan is ready",
      },
      sounds: {
        plan_exit: "/tmp/plan.wav",
      },
      volumes: {
        plan_exit: 0.35,
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled, getMessage, getSoundPath, getSoundVolume } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "plan_exit")).toBe(false)
    expect(isEventNotificationEnabled(config, "plan_exit")).toBe(true)
    expect(getMessage(config, "plan_exit")).toBe("Plan is ready")
    expect(getSoundPath(config, "plan_exit")).toBe("/tmp/plan.wav")
    expect(getSoundVolume(config, "plan_exit")).toBe(0.35)
  })

  test("loadConfig defaults new high-frequency events to sound only", async () => {
    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "session_started")).toBe(true)
    expect(isEventNotificationEnabled(config, "session_started")).toBe(false)
    expect(isEventSoundEnabled(config, "user_message")).toBe(true)
    expect(isEventNotificationEnabled(config, "user_message")).toBe(false)
    expect(isEventSoundEnabled(config, "client_connected")).toBe(true)
    expect(isEventNotificationEnabled(config, "client_connected")).toBe(false)
  })

  test("loadConfig parses new events config from file", async () => {
    const testConfig = {
      events: {
        session_started: { sound: false, notification: true, command: false },
        user_message: { sound: false, notification: false, command: false },
        client_connected: { sound: true, notification: true, command: true },
      },
      messages: {
        session_started: "Started",
        user_message: "User spoke",
        client_connected: "Connected",
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled, getMessage } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "session_started")).toBe(false)
    expect(isEventNotificationEnabled(config, "session_started")).toBe(true)
    expect(isEventSoundEnabled(config, "user_message")).toBe(false)
    expect(isEventNotificationEnabled(config, "user_message")).toBe(false)
    expect(isEventSoundEnabled(config, "client_connected")).toBe(true)
    expect(isEventNotificationEnabled(config, "client_connected")).toBe(true)
    expect(getMessage(config, "session_started")).toBe("Started")
    expect(getMessage(config, "user_message")).toBe("User spoke")
    expect(getMessage(config, "client_connected")).toBe("Connected")
  })

  test("loadConfig parses user_cancelled event config from file", async () => {
    const testConfig = {
      events: {
        user_cancelled: { sound: true, notification: true },
      },
      messages: {
        user_cancelled: "Cancelled: {sessionTitle}",
      },
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "user_cancelled")).toBe(true)
    expect(isEventNotificationEnabled(config, "user_cancelled")).toBe(true)
    expect(config.messages.user_cancelled).toBe("Cancelled: {sessionTitle}")
  })

  test("loadConfig keeps user_cancelled silent when global sound/notification are set", async () => {
    const testConfig = {
      sound: true,
      notification: true,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig, isEventSoundEnabled, isEventNotificationEnabled } = await import("./config")
    const config = loadConfig()

    expect(isEventSoundEnabled(config, "user_cancelled")).toBe(false)
    expect(isEventNotificationEnabled(config, "user_cancelled")).toBe(false)
  })

  test("loadConfig defaults suppressWhenFocused to true", async () => {
    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.suppressWhenFocused).toBe(true)
  })

  test("loadConfig parses suppressWhenFocused from config file", async () => {
    const testConfig = {
      suppressWhenFocused: false,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.suppressWhenFocused).toBe(false)
  })

  test("loadConfig defaults minDuration to 0", async () => {
    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.minDuration).toBe(0)
  })

  test("loadConfig parses minDuration from config file", async () => {
    const testConfig = {
      minDuration: 10,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.minDuration).toBe(10)
  })

  test("loadConfig rejects negative minDuration", async () => {
    const testConfig = {
      minDuration: -5,
    }
    writeFileSync(testConfigPath, JSON.stringify(testConfig))

    const { loadConfig } = await import("./config")
    const config = loadConfig()

    expect(config.minDuration).toBe(0)
  })

  test("interpolateMessage substitutes {timestamp} placeholder", async () => {
    const { interpolateMessage } = await import("./config")
    const result = interpolateMessage("Event at {timestamp}", { timestamp: "14:30:05" })

    expect(result).toBe("Event at 14:30:05")
  })

  test("interpolateMessage substitutes {turn} placeholder", async () => {
    const { interpolateMessage } = await import("./config")
    const result = interpolateMessage("Question {turn}: {sessionTitle}", { sessionTitle: "Fix bug", turn: 3 })

    expect(result).toBe("Question 3: Fix bug")
  })

  test("interpolateMessage substitutes {agentName} placeholder", async () => {
    const { interpolateMessage } = await import("./config")
    const result = interpolateMessage("Subagent: {agentName}", { agentName: "builder" })

    expect(result).toBe("Subagent: builder")
  })

  test("interpolateMessage handles empty {agentName}", async () => {
    const { interpolateMessage } = await import("./config")
    const result = interpolateMessage("Subagent: {agentName}", {})

    expect(result).toBe("Subagent")
  })

  test("interpolateMessage cleans up empty {timestamp} and {turn}", async () => {
    const { interpolateMessage } = await import("./config")
    const result = interpolateMessage("Event {turn} at {timestamp}", {})

    expect(result).toBe("Event at")
  })

  test("getStatePath returns path next to config file", async () => {
    const { getStatePath } = await import("./config")
    const statePath = getStatePath()

    expect(statePath).toEndWith("opencode-notifier-state.json")
  })
})
