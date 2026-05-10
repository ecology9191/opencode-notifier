import type { EventType, MessageContext, NotifierConfig, TelegramConfig } from "./config"
import { isValidTelegramBotToken } from "./config"

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
  context?: MessageContext
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

  await Promise.all(recipients.map(async (chatId) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      })

      if (!response.ok) {
        console.warn("Telegram notification failed")
      }
    } catch {
      console.warn("Telegram notification failed")
    }
  }))
}
