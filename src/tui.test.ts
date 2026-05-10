import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "events"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { tui } from "./tui"

const testConfigDir = join(homedir(), ".config", "opencode-tui-test")
const testConfigPath = join(testConfigDir, "opencode-notifier.json")
const ROUTE_NAME = "opencode-notifier-telegram"

type DialogOption = {
  title: string
  value: string
  disabled?: boolean
  onSelect?: () => void
}

type DialogProps = {
  title: string
  options: DialogOption[]
  current?: string
  onMove?: (option: DialogOption) => void
  onSelect?: (option: DialogOption) => void
}

function cleanupTestConfig() {
  if (existsSync(testConfigDir)) {
    rmSync(testConfigDir, { recursive: true, force: true })
  }
}

function writeRawConfig(config: Record<string, unknown>) {
  mkdirSync(testConfigDir, { recursive: true })
  writeFileSync(testConfigPath, `${JSON.stringify(config, null, 2)}\n`)
}

function readRawConfig(): any {
  return JSON.parse(readFileSync(testConfigPath, "utf-8"))
}

function keypress(name: string, sequence?: string) {
  return {
    name,
    sequence,
    preventDefault: mock(() => {}),
  }
}

function createApi(initialRoute: { name: string; params?: Record<string, unknown> } = { name: "home" }) {
  let currentRoute = initialRoute
  let commandCallback: (() => any[]) | undefined
  let routes: Array<{ name: string; render: () => unknown }> = []
  let dialogProps: DialogProps | undefined
  let disposeLifecycle: (() => void) | undefined

  const keyInput = new EventEmitter()
  const commandDispose = mock(() => {})
  const routeDispose = mock(() => {})
  const lifecycleDispose = mock(() => {})

  const api = {
    command: {
      register: mock((cb: () => any[]) => {
        commandCallback = cb
        return commandDispose
      }),
    },
    route: {
      register: mock((registeredRoutes: Array<{ name: string; render: () => unknown }>) => {
        routes = registeredRoutes
        return routeDispose
      }),
      navigate: mock((name: string, params?: Record<string, unknown>) => {
        currentRoute = params ? { name, params } : { name }
      }),
      get current() {
        return currentRoute
      },
    },
    ui: {
      DialogSelect: mock((props: DialogProps) => {
        dialogProps = props
        return props
      }),
      toast: mock(() => {}),
    },
    renderer: {
      keyInput,
    },
    lifecycle: {
      onDispose: mock((fn: () => void) => {
        disposeLifecycle = fn
        return lifecycleDispose
      }),
    },
  }

  return {
    api,
    keyInput,
    get currentRoute() {
      return currentRoute
    },
    commands() {
      if (!commandCallback) {
        throw new Error("command callback was not registered")
      }
      return commandCallback()
    },
    renderTelegram() {
      const route = routes.find((candidate) => candidate.name === ROUTE_NAME)
      if (!route) {
        throw new Error("telegram route was not registered")
      }
      route.render()
      if (!dialogProps) {
        throw new Error("telegram dialog did not render")
      }
      return dialogProps
    },
    dispose() {
      disposeLifecycle?.()
    },
  }
}

describe("Telegram TUI", () => {
  beforeEach(() => {
    process.env.OPENCODE_NOTIFIER_CONFIG_PATH = testConfigPath
    cleanupTestConfig()
    mkdirSync(testConfigDir, { recursive: true })
  })

  afterEach(() => {
    delete process.env.OPENCODE_NOTIFIER_CONFIG_PATH
    cleanupTestConfig()
  })

  test("Enter toggles the focused global Telegram setting", async () => {
    writeRawConfig({ telegram: { enabled: false } })
    const runtime = createApi()

    await tui(runtime.api as any)
    runtime.commands()[0].onSelect()
    runtime.renderTelegram()

    const key = keypress("return", "\r")
    runtime.keyInput.emit("keypress", key)

    expect(key.preventDefault).toHaveBeenCalled()
    expect(readRawConfig().telegram.enabled).toBe(true)

    const props = runtime.renderTelegram()
    const option = props.options.find((candidate) => candidate.value === "telegram.enabled")
    expect(option?.title).toContain("\x1b[92mEnabled\x1b[0m")
  })

  test("Enter toggles the focused per-event Telegram setting", async () => {
    writeRawConfig({ telegram: { enabled: true } })
    const runtime = createApi()

    await tui(runtime.api as any)
    runtime.commands()[0].onSelect()
    const props = runtime.renderTelegram()
    const option = props.options.find((candidate) => candidate.value === "events.complete.telegram")

    expect(option).toBeDefined()
    props.onMove?.(option!)
    runtime.keyInput.emit("keypress", keypress("enter", "\r"))

    expect(readRawConfig().events.complete.telegram).toBe(false)
  })

  test("Enter does nothing for focused disabled settings", async () => {
    writeRawConfig({ telegram: { enabled: false } })
    const runtime = createApi()

    await tui(runtime.api as any)
    runtime.commands()[0].onSelect()
    const props = runtime.renderTelegram()
    const option = props.options.find((candidate) => candidate.value === "telegram.botToken")

    expect(option?.disabled).toBe(true)
    props.onMove?.(option!)
    runtime.keyInput.emit("keypress", keypress("enter", "\r"))

    expect(readRawConfig().telegram.enabled).toBe(false)
  })

  test("Escape exits Telegram settings to the previous route", async () => {
    const runtime = createApi({ name: "session", params: { sessionID: "abc" } })

    await tui(runtime.api as any)
    runtime.commands()[0].onSelect()

    expect(runtime.currentRoute.name).toBe(ROUTE_NAME)

    const key = keypress("escape", "\x1b")
    runtime.keyInput.emit("keypress", key)

    expect(key.preventDefault).toHaveBeenCalled()
    expect(runtime.currentRoute).toEqual({ name: "session", params: { sessionID: "abc" } })
  })

  test("key handling ignores routes outside Telegram settings", async () => {
    writeRawConfig({ telegram: { enabled: false } })
    const runtime = createApi()

    await tui(runtime.api as any)
    runtime.keyInput.emit("keypress", keypress("enter", "\r"))

    expect(readRawConfig().telegram.enabled).toBe(false)
  })

  test("lifecycle disposal removes the key handler", async () => {
    const runtime = createApi()

    await tui(runtime.api as any)
    expect(runtime.keyInput.listenerCount("keypress")).toBe(1)

    runtime.dispose()

    expect(runtime.keyInput.listenerCount("keypress")).toBe(0)
  })
})
