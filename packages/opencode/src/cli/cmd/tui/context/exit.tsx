import { useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"
import { FormatError, FormatUnknownError } from "@/cli/error"
import { win32FlushInputBuffer } from "../win32"

type Exit = ((reason?: unknown) => Promise<void>) & {
  message: {
    set: (value?: string) => () => void
    clear: () => void
    get: () => string | undefined
  }
  handleCtrlC: () => boolean // Returns true if should exit
}

const CTRL_C_REQUIRED = 3
const CTRL_C_TIMEOUT_MS = 2000

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (input: { onBeforeExit?: () => Promise<void>; onExit?: () => Promise<void> }) => {
    const renderer = useRenderer()
    let message: string | undefined
    let task: Promise<void> | undefined
    let ctrlCCount = 0
    let ctrlCTimer: NodeJS.Timeout | undefined

    const store = {
      set: (value?: string) => {
        const prev = message
        message = value
        return () => {
          message = prev
        }
      },
      clear: () => {
        message = undefined
      },
      get: () => message,
    }

    const resetCtrlC = () => {
      ctrlCCount = 0
      if (ctrlCTimer) {
        clearTimeout(ctrlCTimer)
        ctrlCTimer = undefined
      }
    }

    const showCtrlCHint = (remaining: number) => {
      const text = remaining === 1
        ? "Press Ctrl+C 1 more time to exit"
        : `Press Ctrl+C ${remaining} more times to exit`
      process.stderr.write(`\r\x1b[K\x1b[33m${text}\x1b[0m\n`)
    }

    const doExit = async (reason?: unknown) => {
      if (task) return task
      task = (async () => {
        resetCtrlC()
        await input.onBeforeExit?.()
        // Reset window title before destroying renderer
        renderer.setTerminalTitle("")
        renderer.destroy()
        win32FlushInputBuffer()
        if (reason) {
          const formatted = FormatError(reason) ?? FormatUnknownError(reason)
          if (formatted) {
            process.stderr.write(formatted + "\n")
          }
        }
        const text = store.get()
        if (text) process.stdout.write(text + "\n")
        await input.onExit?.()
      })()
      return task
    }

    const handleCtrlC = (): boolean => {
      ctrlCCount++

      if (ctrlCCount >= CTRL_C_REQUIRED) {
        resetCtrlC()
        return true // Signal that exit should happen
      }

      // Show hint for remaining presses
      showCtrlCHint(CTRL_C_REQUIRED - ctrlCCount)

      // Reset counter after timeout
      if (ctrlCTimer) clearTimeout(ctrlCTimer)
      ctrlCTimer = setTimeout(() => {
        resetCtrlC()
        process.stderr.write("\r\x1b[K\x1b[90mCtrl+C reset. Need 3 presses to exit.\x1b[0m\n")
      }, CTRL_C_TIMEOUT_MS)

      return false
    }

    const exit: Exit = Object.assign(
      (reason?: unknown) => doExit(reason),
      {
        message: store,
        handleCtrlC,
      },
    )

    process.on("SIGHUP", () => exit())
    process.on("SIGINT", () => {
      if (handleCtrlC()) {
        exit()
      }
    })
    return exit
  },
})
