import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { TelegramConfig } from "./config"
import { sendTelegramNotification } from "./telegram"

const originalFetch = globalThis.fetch
const originalWarn = console.warn

function telegramConfig(config: Partial<TelegramConfig> = {}): TelegramConfig {
    return {
      enabled: true,
      botToken: "123456:test-token",
      longPolling: true,
      authorizedChatIds: [123],
      authorizedUserIds: [],
    ...config,
  }
}

describe("sendTelegramNotification", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test("does not fetch when Telegram is disabled", async () => {
    await sendTelegramNotification(
      telegramConfig({ enabled: false }),
      "complete",
      "Done",
      "Task finished"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  test("does not fetch when bot token is missing", async () => {
    await sendTelegramNotification(
      telegramConfig({ botToken: null }),
      "complete",
      "Done",
      "Task finished"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  test("does not fetch when bot token is invalid", async () => {
    await sendTelegramNotification(
      telegramConfig({ botToken: "not a token" }),
      "complete",
      "Done",
      "Task finished"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  test("does not fetch when no recipients are authorized", async () => {
    await sendTelegramNotification(
      telegramConfig({ authorizedChatIds: [], authorizedUserIds: [] }),
      "complete",
      "Done",
      "Task finished"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  test("sends to negative chat ids", async () => {
    await sendTelegramNotification(
      telegramConfig({ authorizedChatIds: [-1001234567890] }),
      "permission",
      "Permission needed",
      "Approve command?"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const call = (globalThis.fetch as any).mock.calls[0]
    expect(String(call?.[0])).toBe("https://api.telegram.org/bot123456:test-token/sendMessage")
    expect(call?.[1]?.method).toBe("POST")
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.chat_id).toBe(-1001234567890)
    expect(body.text).toContain("Permission needed")
    expect(body.text).toContain("Approve command?")
  })

  test("sends JSON API request with message context", async () => {
    await sendTelegramNotification(
      telegramConfig(),
      "complete",
      "Done",
      "Task finished",
      {
        sessionTitle: "Fix bug",
        projectName: "notifier",
        agentName: "builder",
      }
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const call = (globalThis.fetch as any).mock.calls[0]
    expect(String(call?.[0])).toBe("https://api.telegram.org/bot123456:test-token/sendMessage")
    expect(call?.[1]?.method).toBe("POST")
    expect(call?.[1]?.headers?.["Content-Type"]).toBe("application/json")

    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.chat_id).toBe(123)
    expect(body.text).toContain("Done")
    expect(body.text).toContain("Task finished")
    expect(body.text).toContain("Session: Fix bug")
    expect(body.text).toContain("Project: notifier")
    expect(body.text).toContain("Agent: builder")
    expect(body.text).toContain("Event: complete")
  })

  test("sends to multiple authorized recipients", async () => {
    await sendTelegramNotification(
      telegramConfig({ authorizedChatIds: [1, -2], authorizedUserIds: [3] }),
      "complete",
      "Done",
      "Task finished"
    )

    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    const chatIds = (globalThis.fetch as any).mock.calls.map((call: unknown[]) => {
      const init = call[1] as RequestInit
      return JSON.parse(String(init.body)).chat_id
    })
    expect(chatIds).toEqual([1, -2, 3])
  })

  test("deduplicates recipients across chat and user allowlists", async () => {
    await sendTelegramNotification(
      telegramConfig({ authorizedChatIds: [1, 2], authorizedUserIds: [2, 3] }),
      "complete",
      "Done",
      "Task finished"
    )

    const chatIds = (globalThis.fetch as any).mock.calls.map((call: unknown[]) => {
      const init = call[1] as RequestInit
      return JSON.parse(String(init.body)).chat_id
    })
    expect(chatIds).toEqual([1, 2, 3])
  })

  test("warns without throwing when Telegram API responds with an error", async () => {
    globalThis.fetch = mock(async () => new Response("bad", { status: 400 })) as unknown as typeof fetch
    console.warn = mock(() => {}) as unknown as typeof console.warn

    await expect(sendTelegramNotification(
      telegramConfig(),
      "complete",
      "Done",
      "Task finished"
    )).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalledWith("Telegram notification failed")
  })

  test("warns without throwing when Telegram API request rejects", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    console.warn = mock(() => {}) as unknown as typeof console.warn

    await expect(sendTelegramNotification(
      telegramConfig(),
      "complete",
      "Done",
      "Task finished"
    )).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalledWith("Telegram notification failed")
  })
})
