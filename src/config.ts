import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { fileURLToPath } from "url"
import isWsl from "is-wsl"

export type EventType = 
  | "permission"
  | "complete"
  | "subagent_complete"
  | "error"
  | "question"
  | "interrupted"
  | "user_cancelled"
  | "plan_exit"
  | "session_started"
  | "user_message"
  | "client_connected"

export interface EventConfig {
  sound: boolean
  notification: boolean
  command: boolean
  bell: boolean
  telegram: boolean
}

export interface TelegramConfig {
  enabled: boolean
  botToken: string | null
  longPolling: boolean
  authorizedUserIds: number[]
  authorizedChatIds: number[]
}

export interface CommandConfig {
  enabled: boolean
  path: string
  args?: string[]
  minDuration?: number
}

export interface LinuxConfig {
  grouping: boolean
}

export interface MessageContext {
  sessionTitle?: string | null
  agentName?: string | null
  projectName?: string | null
  timestamp?: string | null
  turn?: number | null
}

export interface NotifierConfig {
  sound: boolean
  notification: boolean
  bell: boolean
  timeout: number
  showProjectName: boolean
  showFullPath: boolean
  showSessionTitle: boolean
  showIcon: boolean
  customIconPath: string | null
  suppressWhenFocused: boolean
  enableOnDesktop: boolean
  notificationSystem: "osascript" | "node-notifier" | "ghostty"
  linux: LinuxConfig
  minDuration: number
  command: CommandConfig
  telegram: TelegramConfig
  events: {
    permission: EventConfig
    complete: EventConfig
    subagent_complete: EventConfig
    error: EventConfig
    question: EventConfig
    interrupted: EventConfig
    user_cancelled: EventConfig
    plan_exit: EventConfig
    session_started: EventConfig
    user_message: EventConfig
    client_connected: EventConfig
  }
  messages: {
    permission: string
    complete: string
    subagent_complete: string
    error: string
    question: string
    interrupted: string
    user_cancelled: string
    plan_exit: string
    session_started: string
    user_message: string
    client_connected: string
  }
  sounds: {
    permission: string | null
    complete: string | null
    subagent_complete: string | null
    error: string | null
    question: string | null
    interrupted: string | null
    user_cancelled: string | null
    plan_exit: string | null
    session_started: string | null
    user_message: string | null
    client_connected: string | null
  }
  volumes: {
    permission: number
    complete: number
    subagent_complete: number
    error: number
    question: number
    interrupted: number
    user_cancelled: number
    plan_exit: number
    session_started: number
    user_message: number
    client_connected: number
  }
}

const DEFAULT_EVENT_CONFIG: EventConfig = {
  sound: true,
  notification: true,
  command: true,
  bell: false,
  telegram: true,
}

const DEFAULT_CONFIG: NotifierConfig = {
  sound: true,
  notification: true,
  bell: false,
  timeout: 5,
  showProjectName: true,
  showFullPath: false,
  showSessionTitle: false,
  showIcon: true,
  customIconPath: null,
  suppressWhenFocused: true,
  enableOnDesktop: false,
  notificationSystem: "osascript",
  linux: {
    grouping: false,
  },
  minDuration: 0,
  command: {
    enabled: false,
    path: "",
    minDuration: 0,
  },
  telegram: {
    enabled: false,
    botToken: null,
    longPolling: true,
    authorizedUserIds: [],
    authorizedChatIds: [],
  },
  events: {
    permission: { ...DEFAULT_EVENT_CONFIG },
    complete: { ...DEFAULT_EVENT_CONFIG },
    subagent_complete: { ...DEFAULT_EVENT_CONFIG, sound: false, notification: false, telegram: false },
    error: { ...DEFAULT_EVENT_CONFIG },
    question: { ...DEFAULT_EVENT_CONFIG },
    interrupted: { ...DEFAULT_EVENT_CONFIG },
    user_cancelled: { ...DEFAULT_EVENT_CONFIG, sound: false, notification: false, telegram: false },
    plan_exit: { ...DEFAULT_EVENT_CONFIG },
    session_started: { ...DEFAULT_EVENT_CONFIG, notification: false, telegram: false },
    user_message: { ...DEFAULT_EVENT_CONFIG, notification: false, telegram: false },
    client_connected: { ...DEFAULT_EVENT_CONFIG, notification: false, telegram: false },
  },
  messages: {
    permission: "Session needs permission: {sessionTitle}",
    complete: "Session has finished: {sessionTitle}",
    subagent_complete: "Subagent task completed: {sessionTitle}",
    error: "Session encountered an error: {sessionTitle}",
    question: "Session has a question: {sessionTitle}",
    interrupted: "Session was interrupted: {sessionTitle}",
    user_cancelled: "Session was cancelled by user: {sessionTitle}",
    plan_exit: "Plan ready for review: {sessionTitle}",
    session_started: "Session started: {sessionTitle}",
    user_message: "User sent a message: {sessionTitle}",
    client_connected: "OpenCode connected",
  },
  sounds: {
    permission: null,
    complete: null,
    subagent_complete: null,
    error: null,
    question: null,
    interrupted: null,
    user_cancelled: null,
    plan_exit: null,
    session_started: null,
    user_message: null,
    client_connected: null,
  },
  volumes: {
    permission: 1,
    complete: 1,
    subagent_complete: 1,
    error: 1,
    question: 1,
    interrupted: 1,
    user_cancelled: 1,
    plan_exit: 1,
    session_started: 1,
    user_message: 1,
    client_connected: 1,
  },
}

export function getConfigPath(): string {
  if (process.env.OPENCODE_NOTIFIER_CONFIG_PATH) {
    return process.env.OPENCODE_NOTIFIER_CONFIG_PATH
  }
  return join(homedir(), ".config", "opencode", "opencode-notifier.json")
}

export function getStatePath(): string {
  const configPath = getConfigPath()
  return join(dirname(configPath), "opencode-notifier-state.json")
}

function parseBooleanConfig(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue
}

export function isValidTelegramBotToken(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d+:[A-Za-z0-9_-]+$/.test(value)
}

export function parseTelegramBotTokenFromJson(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const token = value.trim()
  return isValidTelegramBotToken(token) ? token : null
}

function parseSafeIntegerList(value: string | undefined, isAllowed: (value: number) => boolean): number[] {
  if (!value) {
    return []
  }

  const numbers: number[] = []
  const seen = new Set<number>()

  for (const part of value.split(/[\s,]+/)) {
    const trimmed = part.trim()
    if (!/^[+-]?\d+$/.test(trimmed)) {
      continue
    }

    const number = Number(trimmed)
    if (!Number.isSafeInteger(number) || !isAllowed(number) || seen.has(number)) {
      continue
    }

    numbers.push(number)
    seen.add(number)
  }

  return numbers
}

export function parseTelegramIdListFromString(
  value: string,
  isAllowed: (id: number) => boolean
): number[] {
  return parseSafeIntegerList(value, isAllowed)
}

export function parseTelegramIdArray(value: unknown, isAllowed: (id: number) => boolean): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  const numbers: number[] = []
  const seen = new Set<number>()

  for (const item of value) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || !isAllowed(item) || seen.has(item)) {
      continue
    }

    numbers.push(item)
    seen.add(item)
  }

  return numbers
}

type TelegramUserConfig = {
  enabled?: unknown
  botToken?: unknown
  longPolling?: unknown
  authorizedUserIds?: unknown
  authorizedChatIds?: unknown
}

function parseTelegramConfig(userConfig: { telegram?: TelegramUserConfig } = {}): TelegramConfig {
  const telegram = userConfig.telegram ?? {}

  return {
    enabled: parseBooleanConfig(telegram.enabled, DEFAULT_CONFIG.telegram.enabled),
    botToken: parseTelegramBotTokenFromJson(telegram.botToken),
    longPolling: parseBooleanConfig(telegram.longPolling, DEFAULT_CONFIG.telegram.longPolling),
    authorizedUserIds: parseTelegramIdArray(telegram.authorizedUserIds, (id) => id > 0),
    authorizedChatIds: parseTelegramIdArray(telegram.authorizedChatIds, (id) => id !== 0),
  }
}

function parseLegacyEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {}
  }

  try {
    const env: Record<string, string> = {}
    const fileContent = readFileSync(path, "utf-8")

    for (const line of fileContent.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) {
        continue
      }

      const equalsIndex = trimmed.indexOf("=")
      if (equalsIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, equalsIndex).trim()
      let value = trimmed.slice(equalsIndex + 1).trim()
      if (!key) {
        continue
      }

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      env[key] = value
    }

    return env
  } catch {
    return {}
  }
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      return defaultValue
  }
}

function hasLegacyTelegramEnv(envFile: Record<string, string>): boolean {
  return (
    "TELEGRAM_BOT_TOKEN" in envFile ||
    "TELEGRAM_LONG_POLLING" in envFile ||
    "TELEGRAM_AUTHORIZED_USER_IDS" in envFile ||
    "TELEGRAM_AUTHORIZED_CHAT_IDS" in envFile
  )
}

function mergeTelegramIds(currentIds: number[], legacyIds: number[]): number[] {
  const merged = [...currentIds]
  const seen = new Set(merged)

  for (const id of legacyIds) {
    if (!seen.has(id)) {
      merged.push(id)
      seen.add(id)
    }
  }

  return merged
}

function arraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function migrateLegacyTelegramEnv(configPath: string, userConfig: Record<string, unknown>): Record<string, unknown> {
  const legacyEnvPath = join(dirname(configPath), "opencode-notifier.env")
  if (!existsSync(legacyEnvPath)) {
    return userConfig
  }

  const envFile = parseLegacyEnvFile(legacyEnvPath)
  if (!hasLegacyTelegramEnv(envFile)) {
    return userConfig
  }

  const telegram = (typeof userConfig.telegram === "object" && userConfig.telegram !== null && !Array.isArray(userConfig.telegram))
    ? { ...(userConfig.telegram as Record<string, unknown>) }
    : {}
  const currentTelegram = parseTelegramConfig({ telegram: telegram as TelegramUserConfig })
  const botToken = parseTelegramBotTokenFromJson(envFile.TELEGRAM_BOT_TOKEN)
  const authorizedUserIds = parseSafeIntegerList(envFile.TELEGRAM_AUTHORIZED_USER_IDS, (id) => id > 0)
  const authorizedChatIds = parseSafeIntegerList(envFile.TELEGRAM_AUTHORIZED_CHAT_IDS, (id) => id !== 0)
  const longPolling = parseBooleanEnv(envFile.TELEGRAM_LONG_POLLING, DEFAULT_CONFIG.telegram.longPolling)
  let configChanged = false

  if (!currentTelegram.botToken && botToken) {
    telegram.botToken = botToken
    configChanged = true
  }

  const mergedUserIds = mergeTelegramIds(currentTelegram.authorizedUserIds, authorizedUserIds)
  if (!arraysEqual(mergedUserIds, currentTelegram.authorizedUserIds)) {
    telegram.authorizedUserIds = mergedUserIds
    configChanged = true
  }

  const mergedChatIds = mergeTelegramIds(currentTelegram.authorizedChatIds, authorizedChatIds)
  if (!arraysEqual(mergedChatIds, currentTelegram.authorizedChatIds)) {
    telegram.authorizedChatIds = mergedChatIds
    configChanged = true
  }

  if (envFile.TELEGRAM_LONG_POLLING !== undefined && typeof telegram.longPolling !== "boolean") {
    telegram.longPolling = longPolling
    configChanged = true
  }

  const migratedConfig = {
    ...userConfig,
    telegram,
  }

  if (configChanged) {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(migratedConfig, null, 2)}\n`)
  }

  const migratedEnvPath = `${legacyEnvPath}.migrated`
  let envRenamed = false
  try {
    renameSync(legacyEnvPath, migratedEnvPath)
    envRenamed = true
  } catch {
    // Ignore rename failures; JSON migration still succeeded.
  }

  console.warn(
    "Telegram settings were migrated from opencode-notifier.env into opencode-notifier.json. "
    + (envRenamed
      ? `The legacy env file was renamed to ${migratedEnvPath}.`
      : `The legacy env file could not be renamed to ${migratedEnvPath}.`)
  )

  return configChanged ? migratedConfig : userConfig
}

function parseEventConfig(
  userEvent: boolean | { sound?: unknown; notification?: unknown; command?: unknown; bell?: unknown; telegram?: unknown } | undefined,
  defaultConfig: EventConfig
): EventConfig {
  if (userEvent === undefined) {
    return defaultConfig
  }

  if (typeof userEvent === "boolean") {
    return {
      sound: userEvent,
      notification: userEvent,
      command: userEvent,
      bell: defaultConfig.bell,
      telegram: userEvent,
    }
  }

  return {
    sound: parseBooleanConfig(userEvent.sound, defaultConfig.sound),
    notification: parseBooleanConfig(userEvent.notification, defaultConfig.notification),
    command: parseBooleanConfig(userEvent.command, defaultConfig.command),
    bell: parseBooleanConfig(userEvent.bell, defaultConfig.bell),
    telegram: parseBooleanConfig(userEvent.telegram, defaultConfig.telegram),
  }
}

function parseVolume(value: unknown, defaultVolume: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultVolume
  }

  if (value < 0) {
    return 0
  }

  if (value > 1) {
    return 1
  }

  return value
}

export function loadConfig(): NotifierConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    const userConfig = migrateLegacyTelegramEnv(configPath, {})
    return {
      ...DEFAULT_CONFIG,
      telegram: parseTelegramConfig(userConfig as { telegram?: TelegramUserConfig }),
    }
  }

  try {
    const fileContent = readFileSync(configPath, "utf-8")
    let userConfig: Record<string, unknown> = JSON.parse(fileContent)
    if (typeof userConfig === "object" && userConfig !== null && !Array.isArray(userConfig)) {
      userConfig = migrateLegacyTelegramEnv(configPath, userConfig)
    }

    const globalSound = parseBooleanConfig(userConfig.sound, DEFAULT_CONFIG.sound)
    const globalNotification = parseBooleanConfig(userConfig.notification, DEFAULT_CONFIG.notification)
    const globalBell = parseBooleanConfig(userConfig.bell, DEFAULT_CONFIG.bell)

    const defaultWithGlobal: EventConfig = {
      sound: globalSound,
      notification: globalNotification,
      command: true,
      bell: globalBell,
      telegram: globalNotification,
    }

    const userCommand = (userConfig.command ?? {}) as {
      enabled?: unknown
      path?: unknown
      args?: unknown
      minDuration?: unknown
    }
    const commandArgs = Array.isArray(userCommand.args)
      ? userCommand.args.filter((arg: unknown) => typeof arg === "string")
      : undefined

    const commandMinDuration =
      typeof userCommand.minDuration === "number" &&
      Number.isFinite(userCommand.minDuration) &&
      userCommand.minDuration > 0
        ? userCommand.minDuration
        : 0

    return {
      sound: globalSound,
      notification: globalNotification,
      bell: globalBell,
      timeout:
        typeof userConfig.timeout === "number" && userConfig.timeout > 0
          ? userConfig.timeout
          : DEFAULT_CONFIG.timeout,
      showProjectName: (userConfig.showProjectName as boolean | undefined) ?? DEFAULT_CONFIG.showProjectName,
      showFullPath: (userConfig.showFullPath as boolean | undefined) ?? DEFAULT_CONFIG.showFullPath,
      showSessionTitle: (userConfig.showSessionTitle as boolean | undefined) ?? DEFAULT_CONFIG.showSessionTitle,
      showIcon: (userConfig.showIcon as boolean | undefined) ?? DEFAULT_CONFIG.showIcon,
      customIconPath: (userConfig.customIconPath as string | null | undefined) ?? DEFAULT_CONFIG.customIconPath,
      suppressWhenFocused: (userConfig.suppressWhenFocused as boolean | undefined) ?? DEFAULT_CONFIG.suppressWhenFocused,
      enableOnDesktop: typeof userConfig.enableOnDesktop === "boolean" ? userConfig.enableOnDesktop : DEFAULT_CONFIG.enableOnDesktop,
      notificationSystem:
        userConfig.notificationSystem === "node-notifier"
          ? "node-notifier"
          : userConfig.notificationSystem === "ghostty"
            ? "ghostty"
            : "osascript",
      linux: {
        grouping: typeof (userConfig.linux as { grouping?: unknown } | undefined)?.grouping === "boolean"
          ? (userConfig.linux as { grouping: boolean }).grouping
          : DEFAULT_CONFIG.linux.grouping,
      },
      minDuration:
        typeof userConfig.minDuration === "number" && Number.isFinite(userConfig.minDuration) && userConfig.minDuration >= 0
          ? userConfig.minDuration
          : DEFAULT_CONFIG.minDuration,
      command: {
        enabled: typeof userCommand.enabled === "boolean" ? userCommand.enabled : DEFAULT_CONFIG.command.enabled,
        path: typeof userCommand.path === "string" ? userCommand.path : DEFAULT_CONFIG.command.path,
        args: commandArgs,
        minDuration: commandMinDuration,
      },
      telegram: parseTelegramConfig(userConfig as { telegram?: TelegramUserConfig }),
      events: {
        permission: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.permission ?? userConfig.permission) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        complete: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.complete ?? userConfig.complete) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        subagent_complete: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.subagent_complete ?? userConfig.subagent_complete) as Parameters<typeof parseEventConfig>[0], { sound: false, notification: false, command: true, bell: false, telegram: false }),
        error: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.error ?? userConfig.error) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        question: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.question ?? userConfig.question) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        interrupted: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.interrupted ?? userConfig.interrupted) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        user_cancelled: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.user_cancelled ?? userConfig.user_cancelled) as Parameters<typeof parseEventConfig>[0], { sound: false, notification: false, command: true, bell: false, telegram: false }),
        plan_exit: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.plan_exit ?? userConfig.plan_exit) as Parameters<typeof parseEventConfig>[0], defaultWithGlobal),
        session_started: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.session_started ?? userConfig.session_started) as Parameters<typeof parseEventConfig>[0], { ...defaultWithGlobal, notification: false, telegram: false }),
        user_message: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.user_message ?? userConfig.user_message) as Parameters<typeof parseEventConfig>[0], { ...defaultWithGlobal, notification: false, telegram: false }),
        client_connected: parseEventConfig(((userConfig.events as Record<string, unknown> | undefined)?.client_connected ?? userConfig.client_connected) as Parameters<typeof parseEventConfig>[0], { ...defaultWithGlobal, notification: false, telegram: false }),
      },
      messages: {
        permission: (userConfig.messages as Record<string, string> | undefined)?.permission ?? DEFAULT_CONFIG.messages.permission,
        complete: (userConfig.messages as Record<string, string> | undefined)?.complete ?? DEFAULT_CONFIG.messages.complete,
        subagent_complete: (userConfig.messages as Record<string, string> | undefined)?.subagent_complete ?? DEFAULT_CONFIG.messages.subagent_complete,
        error: (userConfig.messages as Record<string, string> | undefined)?.error ?? DEFAULT_CONFIG.messages.error,
        question: (userConfig.messages as Record<string, string> | undefined)?.question ?? DEFAULT_CONFIG.messages.question,
        interrupted: (userConfig.messages as Record<string, string> | undefined)?.interrupted ?? DEFAULT_CONFIG.messages.interrupted,
        user_cancelled: (userConfig.messages as Record<string, string> | undefined)?.user_cancelled ?? DEFAULT_CONFIG.messages.user_cancelled,
        plan_exit: (userConfig.messages as Record<string, string> | undefined)?.plan_exit ?? DEFAULT_CONFIG.messages.plan_exit,
        session_started: (userConfig.messages as Record<string, string> | undefined)?.session_started ?? DEFAULT_CONFIG.messages.session_started,
        user_message: (userConfig.messages as Record<string, string> | undefined)?.user_message ?? DEFAULT_CONFIG.messages.user_message,
        client_connected: (userConfig.messages as Record<string, string> | undefined)?.client_connected ?? DEFAULT_CONFIG.messages.client_connected,
      },
      sounds: {
        permission: (userConfig.sounds as Record<string, string | null> | undefined)?.permission ?? DEFAULT_CONFIG.sounds.permission,
        complete: (userConfig.sounds as Record<string, string | null> | undefined)?.complete ?? DEFAULT_CONFIG.sounds.complete,
        subagent_complete: (userConfig.sounds as Record<string, string | null> | undefined)?.subagent_complete ?? DEFAULT_CONFIG.sounds.subagent_complete,
        error: (userConfig.sounds as Record<string, string | null> | undefined)?.error ?? DEFAULT_CONFIG.sounds.error,
        question: (userConfig.sounds as Record<string, string | null> | undefined)?.question ?? DEFAULT_CONFIG.sounds.question,
        interrupted: (userConfig.sounds as Record<string, string | null> | undefined)?.interrupted ?? DEFAULT_CONFIG.sounds.interrupted,
        user_cancelled: (userConfig.sounds as Record<string, string | null> | undefined)?.user_cancelled ?? DEFAULT_CONFIG.sounds.user_cancelled,
        plan_exit: (userConfig.sounds as Record<string, string | null> | undefined)?.plan_exit ?? DEFAULT_CONFIG.sounds.plan_exit,
        session_started: (userConfig.sounds as Record<string, string | null> | undefined)?.session_started ?? DEFAULT_CONFIG.sounds.session_started,
        user_message: (userConfig.sounds as Record<string, string | null> | undefined)?.user_message ?? DEFAULT_CONFIG.sounds.user_message,
        client_connected: (userConfig.sounds as Record<string, string | null> | undefined)?.client_connected ?? DEFAULT_CONFIG.sounds.client_connected,
      },
      volumes: {
        permission: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.permission, DEFAULT_CONFIG.volumes.permission),
        complete: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.complete, DEFAULT_CONFIG.volumes.complete),
        subagent_complete: parseVolume(
          (userConfig.volumes as Record<string, unknown> | undefined)?.subagent_complete,
          DEFAULT_CONFIG.volumes.subagent_complete
        ),
        error: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.error, DEFAULT_CONFIG.volumes.error),
        question: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.question, DEFAULT_CONFIG.volumes.question),
        interrupted: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.interrupted, DEFAULT_CONFIG.volumes.interrupted),
        user_cancelled: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.user_cancelled, DEFAULT_CONFIG.volumes.user_cancelled),
        plan_exit: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.plan_exit, DEFAULT_CONFIG.volumes.plan_exit),
        session_started: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.session_started, DEFAULT_CONFIG.volumes.session_started),
        user_message: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.user_message, DEFAULT_CONFIG.volumes.user_message),
        client_connected: parseVolume((userConfig.volumes as Record<string, unknown> | undefined)?.client_connected, DEFAULT_CONFIG.volumes.client_connected),
      },
    }
  } catch {
    return {
      ...DEFAULT_CONFIG,
      telegram: parseTelegramConfig(),
    }
  }
}

export function isEventSoundEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event].sound
}

export function isEventNotificationEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event].notification
}

export function isEventCommandEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event].command
}

export function isEventBellEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event].bell
}

export function isEventTelegramEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event].telegram
}

export function getMessage(config: NotifierConfig, event: EventType): string {
  return config.messages[event]
}

export function getSoundPath(config: NotifierConfig, event: EventType): string | null {
  return config.sounds[event]
}

export function getSoundVolume(config: NotifierConfig, event: EventType): number {
  return config.volumes[event]
}

export function getIconPath(config: NotifierConfig): string | undefined {
  if (!config.showIcon) {
    return undefined
  }

  try {
    let iconPath: string
    if (config.customIconPath) {
      iconPath = config.customIconPath
    } else {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      iconPath = join(__dirname, "..", "logos", "opencode-logo-dark.png")
    }

    // Don't check when invoked from WSL since it will
    // fail to verify windows path anyway (currently
    // path with backslackes needs to be specified)
    // https://github.com/mikaelbr/node-notifier/issues/354
    if (isWsl || existsSync(iconPath)) {
      return iconPath
    }
  } catch {
    // Ignore errors - notifications will work without icon
  }

  return undefined
}

export function interpolateMessage(message: string, context: MessageContext): string {
  let result = message

  const sessionTitle = context.sessionTitle || ""
  result = result.replaceAll("{sessionTitle}", sessionTitle)

  const agentName = context.agentName || ""
  result = result.replaceAll("{agentName}", agentName)

  const projectName = context.projectName || ""
  result = result.replaceAll("{projectName}", projectName)

  const timestamp = context.timestamp || ""
  result = result.replaceAll("{timestamp}", timestamp)

  const turn = context.turn != null ? String(context.turn) : ""
  result = result.replaceAll("{turn}", turn)

  result = result.replace(/\s*[:\-|]\s*$/, "").trim()
  result = result.replace(/\s{2,}/g, " ")

  return result
}
