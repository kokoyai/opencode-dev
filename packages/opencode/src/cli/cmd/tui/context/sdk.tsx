import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2"
import { createSimpleContext } from "./helper"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup, onMount } from "solid-js"

export type EventSource = {
  on: (handler: (event: Event) => void) => () => void
  setWorkspace?: (workspaceID?: string) => void
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let workspaceID: string | undefined
    let sse: AbortController | undefined

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: props.fetch,
        headers: props.headers,
        experimental_workspaceID: workspaceID,
      })
    }

    let sdk = createSDK()

    const emitter = createGlobalEmitter<{
      [key in Event["type"]]: Extract<Event, { type: key }>
    }>()

    let queue: Event[] = []
    let timer: Timer | undefined
    let last = 0

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit(event.type, event)
        }
      })
    }

    const handleEvent = (event: Event) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    function startSSE() {
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl

      // Circuit breaker: track consecutive failures
      let consecutiveFailures = 0
      const MAX_FAILURES = 3
      const RETRY_DELAY = 5000 // 5 seconds
      const CONNECTION_TIMEOUT = 30000 // 30 seconds

      ;(async () => {
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // Check circuit breaker
          if (consecutiveFailures >= MAX_FAILURES) {
            console.error(`SSE connection failed ${MAX_FAILURES} times, pausing for ${RETRY_DELAY}ms`)
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
            consecutiveFailures = 0 // Reset after pause
            continue
          }

          try {
            // Add timeout to subscription
            const timeoutController = new AbortController()
            const timeoutId = setTimeout(() => {
              timeoutController.abort()
            }, CONNECTION_TIMEOUT)

            const events = await Promise.race([
              sdk.event.subscribe({}, { signal: ctrl.signal }),
              new Promise<never>((_, reject) => {
                timeoutController.signal.addEventListener("abort", () => {
                  reject(new Error("SSE connection timeout"))
                })
              }),
            ])

            clearTimeout(timeoutId)

            // Reset failure counter on successful connection
            consecutiveFailures = 0

            for await (const event of events.stream) {
              if (ctrl.signal.aborted) break
              handleEvent(event)
            }

            if (timer) clearTimeout(timer)
            if (queue.length > 0) flush()
          } catch (error) {
            consecutiveFailures++
            const errorMsg = error instanceof Error ? error.message : String(error)

            // Distinguish between timeout errors and other errors
            if (errorMsg.includes("timeout") || errorMsg.includes("SSE")) {
              console.warn("SSE timeout or stream error:", errorMsg, "- reconnecting...")
            } else {
              console.error("SSE connection error:", errorMsg)
            }

            // Exponential backoff for retries
            const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), 30000)

            // Wait before reconnecting
            if (!abort.signal.aborted && !ctrl.signal.aborted) {
              await new Promise((resolve) => setTimeout(resolve, backoffDelay))
            }
          }
        }
      })().catch((error) => {
        console.error("SSE loop fatal error:", error instanceof Error ? error.message : error)
      })
    }

    onMount(() => {
      if (props.events) {
        const unsub = props.events.on(handleEvent)
        onCleanup(unsub)
      } else {
        startSSE()
      }
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
    })

    return {
      get client() {
        return sdk
      },
      get workspaceID() {
        return workspaceID
      },
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      setWorkspace(next?: string) {
        if (workspaceID === next) return
        workspaceID = next
        sdk = createSDK()
        props.events?.setWorkspace?.(next)
        if (!props.events) startSSE()
      },
      url: props.url,
    }
  },
})
