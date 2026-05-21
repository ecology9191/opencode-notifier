import type { EventType, NotifierConfig } from "./config"
import { getConfigPath, loadConfig } from "./config"
import {
  setTelegramAuthorizedChatIds,
  setTelegramAuthorizedChatIdsFromString,
  setTelegramAuthorizedUserIds,
  setTelegramAuthorizedUserIdsFromString,
  setTelegramBotToken,
  setTelegramEnabled,
  setTelegramEventEnabled,
  setTelegramLongPolling,
} from "./tui-config"

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

type TuiCommand = {
  title: string
  value: string
  description?: string
  category?: string
  keybind?: string
  onSelect?: () => void
}

type TuiApi = {
  command: {
    register(cb: () => TuiCommand[]): () => void
  }
  route: {
    register(routes: Array<{ name: string; render: (input?: { params?: Record<string, unknown> }) => unknown }>): () => void
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
    }): unknown
    DialogPrompt(props: {
      title: string
      description?: () => unknown
      placeholder?: string
      value?: string
      onConfirm?: (value: string) => void
      onCancel?: () => void
    }): unknown
    DialogConfirm(props: {
      title: string
      message: string
      onConfirm?: () => void
      onCancel?: () => void
    }): unknown
    toast(input: { variant?: "info" | "success" | "warning" | "error"; title?: string; message: string; duration?: number }): void
    dialog: {
      replace: (render: () => unknown, onClose?: () => void) => void
      clear: () => void
    }
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

function showErrorToast(api: TuiApi, message?: string): void {
  api.ui.toast({
    variant: "error",
    title: "Telegram settings not saved",
    message: message ?? `Could not write ${getConfigPath()}`,
  })
}

function returnToSettings(api: TuiApi): void {
  api.ui.dialog.clear()
  api.route.navigate(ROUTE_NAME)
}

function openPrompt(
  api: TuiApi,
  props: {
    title: string
    placeholder?: string
    value?: string
    onConfirm: (value: string) => void
  }
): void {
  api.ui.dialog.replace(
    () => api.ui.DialogPrompt({
      title: props.title,
      placeholder: props.placeholder,
      value: props.value ?? "",
      onConfirm: (value) => {
        try {
          props.onConfirm(value)
          returnToSettings(api)
        } catch (error) {
          showErrorToast(api, error instanceof Error ? error.message : String(error))
          returnToSettings(api)
        }
      },
      onCancel: () => returnToSettings(api),
    }),
    () => returnToSettings(api)
  )
}

function openConfirm(
  api: TuiApi,
  props: {
    title: string
    message: string
    onConfirm: () => void
  }
): void {
  api.ui.dialog.replace(
    () => api.ui.DialogConfirm({
      title: props.title,
      message: props.message,
      onConfirm: () => {
        try {
          props.onConfirm()
          returnToSettings(api)
        } catch {
          showErrorToast(api)
          returnToSettings(api)
        }
      },
      onCancel: () => returnToSettings(api),
    }),
    () => returnToSettings(api)
  )
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

function toggleLongPolling(api: TuiApi, config: NotifierConfig): void {
  const enabled = !config.telegram.longPolling
  try {
    setTelegramLongPolling(enabled)
    showSavedToast(api, `Long polling ${enabled ? "on" : "off"}.`)
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
      description: "Toggle telegram.enabled in opencode-notifier.json.",
      category: "Status",
      onSelect: () => toggleTelegram(api, config),
    },
    {
      title: `Bot token: ${config.telegram.botToken ? "Present" : "Missing or invalid"}`,
      value: "telegram.botToken",
      description: "Set or replace the bot token (validated, never shown in this list).",
      category: "Secrets",
      onSelect: () => openPrompt(api, {
        title: "Telegram bot token",
        placeholder: "123456789:your-bot-token",
        onConfirm: (value) => {
          setTelegramBotToken(value.trim() === "" ? null : value.trim())
          showSavedToast(api, "Bot token updated.")
        },
      }),
    },
    {
      title: "Clear bot token",
      value: "telegram.botToken.clear",
      description: "Remove the stored bot token from config.",
      category: "Secrets",
      onSelect: () => openConfirm(api, {
        title: "Clear bot token",
        message: "Remove the Telegram bot token from opencode-notifier.json?",
        onConfirm: () => {
          setTelegramBotToken(null)
          showSavedToast(api, "Bot token cleared.")
        },
      }),
    },
    {
      title: `Long polling: ${config.telegram.longPolling ? "On" : "Off"}`,
      value: "telegram.longPolling",
      description: "Informational until inbound Telegram commands are implemented.",
      category: "Status",
      onSelect: () => toggleLongPolling(api, config),
    },
    {
      title: `Authorized users: ${config.telegram.authorizedUserIds.length}`,
      value: "telegram.authorizedUserIds",
      description: "Comma- or space-separated positive user IDs.",
      category: "Authorization",
      onSelect: () => openPrompt(api, {
        title: "Authorized user IDs",
        placeholder: "123456789, 987654321",
        value: config.telegram.authorizedUserIds.join(", "),
        onConfirm: (value) => {
          setTelegramAuthorizedUserIdsFromString(value)
          showSavedToast(api, "Authorized user IDs updated.")
        },
      }),
    },
    {
      title: "Clear authorized users",
      value: "telegram.authorizedUserIds.clear",
      description: "Remove all authorized user IDs.",
      category: "Authorization",
      onSelect: () => openConfirm(api, {
        title: "Clear authorized users",
        message: "Remove all authorized user IDs?",
        onConfirm: () => {
          setTelegramAuthorizedUserIds([])
          showSavedToast(api, "Authorized user IDs cleared.")
        },
      }),
    },
    {
      title: `Authorized chats: ${config.telegram.authorizedChatIds.length}`,
      value: "telegram.authorizedChatIds",
      description: "Comma- or space-separated chat IDs (negative group IDs allowed).",
      category: "Authorization",
      onSelect: () => openPrompt(api, {
        title: "Authorized chat IDs",
        placeholder: "-1001234567890, 42",
        value: config.telegram.authorizedChatIds.join(", "),
        onConfirm: (value) => {
          setTelegramAuthorizedChatIdsFromString(value)
          showSavedToast(api, "Authorized chat IDs updated.")
        },
      }),
    },
    {
      title: "Clear authorized chats",
      value: "telegram.authorizedChatIds.clear",
      description: "Remove all authorized chat IDs.",
      category: "Authorization",
      onSelect: () => openConfirm(api, {
        title: "Clear authorized chats",
        message: "Remove all authorized chat IDs?",
        onConfirm: () => {
          setTelegramAuthorizedChatIds([])
          showSavedToast(api, "Authorized chat IDs cleared.")
        },
      }),
    },
    {
      title: `Config file: ${getConfigPath()}`,
      value: "paths.config",
      description: "All Telegram settings, including secrets, are stored here.",
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
    api.ui.dialog.clear()
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
