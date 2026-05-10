import type { EventType, MessageContext, NotifierConfig, TelegramConfig } from "./config"
import { isValidTelegramBotToken } from "./config"

const DEFAULT_TELEGRAM_TIMEOUT_MS = 10_000

type TelegramSendOptions = {
  timeoutMs?: number
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function warnTelegramFailure(chatId: number, detail: Record<string, unknown>): void {
  console.warn("Telegram notification failed", { chatId, ...detail })
}

function getTimeoutMs(options: TelegramSendOptions): number {
  if (typeof options.timeoutMs !== "number" || !Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    return DEFAULT_TELEGRAM_TIMEOUT_MS
  }

  return options.timeoutMs
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function getTelegramConfig(config: NotifierConfig | TelegramConfig): TelegramConfig {
  return "telegram" in config ? config.telegram : config
}

function getRecipients(config: TelegramConfig): number[] {
  return [...new Set([
    ...config.authorizedChatIds,
    ...config.authorizedUserIds,
  ])]
}

function formatTelegramMessage(
  eventType: EventType,
  title: string,
  message: string,
  context?: MessageContext
): string {
  const lines = [`${title}`, message]

  if (context?.sessionTitle) {
    lines.push(`Session: ${context.sessionTitle}`)
  }

  if (context?.projectName) {
    lines.push(`Project: ${context.projectName}`)
  }

  if (context?.agentName) {
    lines.push(`Agent: ${context.agentName}`)
  }

  lines.push(`Event: ${eventType}`)

  return lines.join("\n")
}

export async function sendTelegramNotification(
  config: NotifierConfig | TelegramConfig,
  eventType: EventType,
  title: string,
  message: string,
  context?: MessageContext,
  options: TelegramSendOptions = {}
): Promise<void> {
  const telegram = getTelegramConfig(config)

  if (!telegram.enabled || !isValidTelegramBotToken(telegram.botToken)) {
    return
  }

  const recipients = getRecipients(telegram)
  if (recipients.length === 0) {
    return
  }

  const text = formatTelegramMessage(eventType, title, message, context)
  const url = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`
  const timeoutMs = getTimeoutMs(options)

  await Promise.all(recipients.map(async (chatId) => {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: {
            is_disabled: true,
          },
        }),
      }, timeoutMs)

      if (!response.ok) {
        warnTelegramFailure(chatId, {
          status: response.status,
          statusText: response.statusText,
        })
      }
    } catch (error) {
      warnTelegramFailure(chatId, {
        error: getErrorMessage(error),
      })
    }
  }))
}
