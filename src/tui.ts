import type { EventType, NotifierConfig } from "./config"
import { getConfigPath, getEnvPath, loadConfig } from "./config"
import { setTelegramEnabled, setTelegramEventEnabled } from "./tui-config"

type TuiElement = unknown

type TuiCommand = {
  title: string
  value: string
  description?: string
  category?: string
  keybind?: string
  onSelect?: () => void
}

type TuiDialogSelectOption = {
  title: string
  value: string
  description?: string
  category?: string
  disabled?: boolean
  onSelect?: () => void
}

type TuiRouteCurrent = {
  name: string
  params?: Record<string, unknown>
}

type TuiKeyEvent = {
  name?: string
  sequence?: string
  raw?: string
  preventDefault?: () => void
}

type TuiApi = {
  command: {
    register(cb: () => TuiCommand[]): () => void
  }
  route: {
    register(routes: Array<{ name: string; render: (input?: { params?: Record<string, unknown> }) => TuiElement }>): () => void
    navigate(name: string, params?: Record<string, unknown>): void
    readonly current?: TuiRouteCurrent
  }
  ui: {
    DialogSelect(props: {
      title: string
      placeholder?: string
      options: TuiDialogSelectOption[]
      onMove?: (option: TuiDialogSelectOption) => void
      onSelect?: (option: TuiDialogSelectOption) => void
      current?: string
    }): TuiElement
    toast(input: { variant?: "info" | "success" | "warning" | "error"; title?: string; message: string; duration?: number }): void
  }
  renderer?: {
    keyInput?: {
      on(event: "keypress", handler: (key: TuiKeyEvent) => void): void
      off?(event: "keypress", handler: (key: TuiKeyEvent) => void): void
      removeListener?(event: "keypress", handler: (key: TuiKeyEvent) => void): void
    }
  }
  lifecycle?: {
    onDispose(fn: () => void): () => void
  }
}

type TuiPlugin = (api: TuiApi, options?: Record<string, unknown>, meta?: unknown) => Promise<void>

type TuiPluginModule = {
  id: string
  tui: TuiPlugin
}

const ROUTE_NAME = "opencode-notifier-telegram"
const PALETTE_VALUE = "palette.telegram"
const ANSI_RESET = "\x1b[0m"
const ANSI_BRIGHT_GREEN = "\x1b[92m"
const ANSI_BRIGHT_RED = "\x1b[91m"

const TELEGRAM_ENV_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_LONG_POLLING",
  "TELEGRAM_AUTHORIZED_USER_IDS",
  "TELEGRAM_AUTHORIZED_CHAT_IDS",
] as const

const EVENT_TYPES: EventType[] = [
  "permission",
  "complete",
  "subagent_complete",
  "error",
  "question",
  "interrupted",
  "user_cancelled",
  "plan_exit",
  "session_started",
  "user_message",
  "client_connected",
]

function status(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled"
}

function coloredStatus(value: boolean): string {
  const color = value ? ANSI_BRIGHT_GREEN : ANSI_BRIGHT_RED
  return `${color}${status(value)}${ANSI_RESET}`
}

function eventLabel(event: EventType): string {
  return event
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function showSavedToast(api: TuiApi, message: string): void {
  api.ui.toast({
    variant: "success",
    title: "Telegram settings saved",
    message,
  })
}

function showErrorToast(api: TuiApi): void {
  api.ui.toast({
    variant: "error",
    title: "Telegram settings not saved",
    message: `Could not write ${getConfigPath()}`,
  })
}

function toggleTelegram(api: TuiApi, config: NotifierConfig): void {
  const enabled = !config.telegram.enabled
  try {
    setTelegramEnabled(enabled)
    showSavedToast(api, `Telegram ${status(enabled).toLowerCase()}.`)
    api.route.navigate(ROUTE_NAME)
  } catch {
    showErrorToast(api)
  }
}

function toggleEvent(api: TuiApi, event: EventType, enabled: boolean): void {
  try {
    setTelegramEventEnabled(event, enabled)
    showSavedToast(api, `${eventLabel(event)} Telegram ${status(enabled).toLowerCase()}.`)
    api.route.navigate(ROUTE_NAME)
  } catch {
    showErrorToast(api)
  }
}

function telegramOptions(api: TuiApi): TuiDialogSelectOption[] {
  const config = loadConfig()

  return [
    {
      title: `Telegram: ${coloredStatus(config.telegram.enabled)}`,
      value: "telegram.enabled",
      description: "Toggle persisted telegram.enabled in opencode-notifier JSON config.",
      category: "Status",
      onSelect: () => toggleTelegram(api, config),
    },
    {
      title: `Bot token: ${config.telegram.botToken ? "Present" : "Missing or invalid"}`,
      value: "telegram.botToken",
      description: "Loaded from TELEGRAM_BOT_TOKEN. Token value is validated and hidden.",
      category: "Status",
      disabled: true,
    },
    {
      title: `Long polling: ${config.telegram.longPolling ? "On" : "Off"}`,
      value: "telegram.longPolling",
      description: "Informational value loaded from TELEGRAM_LONG_POLLING.",
      category: "Status",
      disabled: true,
    },
    {
      title: `Authorized users: ${config.telegram.authorizedUserIds.length}`,
      value: "telegram.authorizedUserIds",
      description: "Loaded from TELEGRAM_AUTHORIZED_USER_IDS.",
      category: "Authorization",
      disabled: true,
    },
    {
      title: `Authorized chats: ${config.telegram.authorizedChatIds.length}`,
      value: "telegram.authorizedChatIds",
      description: "Loaded from TELEGRAM_AUTHORIZED_CHAT_IDS.",
      category: "Authorization",
      disabled: true,
    },
    {
      title: `Config file: ${getConfigPath()}`,
      value: "paths.config",
      description: "Non-secret Telegram toggles are persisted here.",
      category: "Paths",
      disabled: true,
    },
    {
      title: `Env file: ${getEnvPath()}`,
      value: "paths.env",
      description: `Variables: ${TELEGRAM_ENV_VARS.join(", ")}`,
      category: "Paths",
      disabled: true,
    },
    ...EVENT_TYPES.map((event) => {
      const enabled = config.events[event].telegram
      return {
        title: `${eventLabel(event)}: ${coloredStatus(enabled)}`,
        value: `events.${event}.telegram`,
        description: "Toggle this event for Telegram notifications.",
        category: "Per-event Telegram toggles",
        onSelect: () => toggleEvent(api, event, !enabled),
      }
    }),
  ]
}

export const tui: TuiPlugin = async (api) => {
  let previousRoute: TuiRouteCurrent | undefined
  let focusedValue = "telegram.enabled"
  let lastActivatedValue: string | undefined
  let lastActivatedAt = 0

  const openTelegramSettings = () => {
    const currentRoute = api.route.current
    previousRoute = currentRoute?.name === ROUTE_NAME ? previousRoute : currentRoute
    focusedValue = "telegram.enabled"
    api.route.navigate(ROUTE_NAME)
  }

  const activateOption = (option: TuiDialogSelectOption | undefined) => {
    if (!option?.onSelect || option.disabled) {
      return
    }

    const now = Date.now()
    if (lastActivatedValue === option.value && now - lastActivatedAt < 75) {
      return
    }

    lastActivatedValue = option.value
    lastActivatedAt = now
    option.onSelect()
  }

  const closeTelegramSettings = () => {
    const route = previousRoute?.name && previousRoute.name !== ROUTE_NAME ? previousRoute : { name: "home" }
    api.route.navigate(route.name, route.params)
  }

  const handleKeypress = (key: TuiKeyEvent) => {
    if (api.route.current?.name !== ROUTE_NAME) {
      return
    }

    const keyName = key.name?.toLowerCase()
    const sequence = key.sequence ?? key.raw

    if (keyName === "escape" || keyName === "esc" || sequence === "\x1b") {
      key.preventDefault?.()
      closeTelegramSettings()
      return
    }

    if (keyName === "return" || keyName === "enter" || sequence === "\r" || sequence === "\n") {
      const option = telegramOptions(api).find((candidate) => candidate.value === focusedValue)
      key.preventDefault?.()
      activateOption(option)
    }
  }

  const disposers = [
    api.command.register(() => {
      const config = loadConfig()
      return [
        {
          title: `Telegram: ${coloredStatus(config.telegram.enabled)}`,
          value: PALETTE_VALUE,
          category: "Plugin",
          description: "Open opencode-notifier Telegram settings.",
          onSelect: openTelegramSettings,
        },
      ]
    }),
    api.route.register([
      {
        name: ROUTE_NAME,
        render: () => api.ui.DialogSelect({
          title: "Telegram Settings",
          placeholder: "Select a Telegram setting",
          options: telegramOptions(api),
          current: focusedValue,
          onMove: (option) => {
            focusedValue = option.value
          },
          onSelect: activateOption,
        }),
      },
    ]),
  ]

  const keyInput = api.renderer?.keyInput
  keyInput?.on("keypress", handleKeypress)
  if (keyInput) {
    disposers.push(() => {
      if (keyInput.off) {
        keyInput.off("keypress", handleKeypress)
        return
      }
      keyInput.removeListener?.("keypress", handleKeypress)
    })
  }

  api.lifecycle?.onDispose(() => {
    for (const dispose of disposers) {
      dispose()
    }
  })
}

const plugin: TuiPluginModule = {
  id: "opencode-telegram-notifications",
  tui,
}

export default plugin
