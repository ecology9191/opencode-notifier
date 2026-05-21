import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname } from "path"
import type { EventType } from "./config"
import {
  getConfigPath,
  parseTelegramBotTokenFromJson,
  parseTelegramIdArray,
  parseTelegramIdListFromString,
} from "./config"

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null
}

function readRawConfig(): JsonObject {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return {}
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf-8"))
  const rawConfig = asObject(parsed)
  if (!rawConfig) {
    throw new Error(`Expected ${configPath} to contain a JSON object`)
  }

  return rawConfig
}

function writeRawConfig(config: JsonObject): void {
  const configPath = getConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

function getTelegramObject(rawConfig: JsonObject): JsonObject {
  const telegram = asObject(rawConfig.telegram) ?? {}
  rawConfig.telegram = telegram
  return telegram
}

export function setTelegramEnabled(enabled: boolean): void {
  const rawConfig = readRawConfig()
  const telegram = getTelegramObject(rawConfig)
  telegram.enabled = enabled
  writeRawConfig(rawConfig)
}

export function setTelegramBotToken(token: string | null): void {
  const parsed = token === null || token.trim() === "" ? null : parseTelegramBotTokenFromJson(token)
  if (token !== null && token.trim() !== "" && parsed === null) {
    throw new Error("Invalid Telegram bot token format")
  }

  const rawConfig = readRawConfig()
  const telegram = getTelegramObject(rawConfig)
  telegram.botToken = parsed
  writeRawConfig(rawConfig)
}

export function setTelegramLongPolling(enabled: boolean): void {
  const rawConfig = readRawConfig()
  const telegram = getTelegramObject(rawConfig)
  telegram.longPolling = enabled
  writeRawConfig(rawConfig)
}

export function setTelegramAuthorizedUserIds(ids: number[]): void {
  const rawConfig = readRawConfig()
  const telegram = getTelegramObject(rawConfig)
  telegram.authorizedUserIds = parseTelegramIdArray(ids, (id) => id > 0)
  writeRawConfig(rawConfig)
}

export function setTelegramAuthorizedChatIds(ids: number[]): void {
  const rawConfig = readRawConfig()
  const telegram = getTelegramObject(rawConfig)
  telegram.authorizedChatIds = parseTelegramIdArray(ids, (id) => id !== 0)
  writeRawConfig(rawConfig)
}

export function setTelegramAuthorizedUserIdsFromString(value: string): void {
  setTelegramAuthorizedUserIds(parseTelegramIdListFromString(value, (id) => id > 0))
}

export function setTelegramAuthorizedChatIdsFromString(value: string): void {
  setTelegramAuthorizedChatIds(parseTelegramIdListFromString(value, (id) => id !== 0))
}

export function setTelegramEventEnabled(event: EventType, enabled: boolean): void {
  const rawConfig = readRawConfig()
  const events = asObject(rawConfig.events) ?? {}
  const current = events[event]

  if (typeof current === "boolean") {
    events[event] = {
      sound: current,
      notification: current,
      command: current,
      telegram: enabled,
    }
  } else {
    const eventConfig = asObject(current) ?? {}
    eventConfig.telegram = enabled
    events[event] = eventConfig
  }

  rawConfig.events = events
  writeRawConfig(rawConfig)
}
