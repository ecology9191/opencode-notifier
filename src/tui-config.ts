import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname } from "path"
import type { EventType } from "./config"
import { getConfigPath } from "./config"

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null
}

function readRawConfig(): JsonObject {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return {}
  }

  try {
    return asObject(JSON.parse(readFileSync(configPath, "utf-8"))) ?? {}
  } catch {
    return {}
  }
}

function writeRawConfig(config: JsonObject): void {
  const configPath = getConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

export function setTelegramEnabled(enabled: boolean): void {
  const rawConfig = readRawConfig()
  const telegram = asObject(rawConfig.telegram) ?? {}
  telegram.enabled = enabled
  rawConfig.telegram = telegram
  writeRawConfig(rawConfig)
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
