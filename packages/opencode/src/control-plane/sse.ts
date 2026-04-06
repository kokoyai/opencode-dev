export class SSETimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`SSE stream read timeout after ${timeoutMs / 1000}s`)
    this.name = "SSETimeoutError"
  }
}

export interface SSEOptions {
  /** Timeout in milliseconds for stream reads. Default: 300000 (5 minutes) */
  timeoutMs?: number
  /** Called when a timeout occurs, before reconnection. Return false to stop. */
  onTimeout?: () => boolean | void | Promise<boolean | void>
  /** Called on errors. Return false to stop the stream. */
  onError?: (error: Error) => boolean | void | Promise<boolean | void>
}

export async function parseSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: unknown) => void,
  options?: SSEOptions,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let last = ""
  let retry = 1000

  // Configurable timeout for stream reads (default: 5 minutes)
  const STREAM_TIMEOUT = options?.timeoutMs ?? 300000
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const abort = () => {
    if (timeoutId) clearTimeout(timeoutId)
    void reader.cancel().catch(() => undefined)
  }

  signal.addEventListener("abort", abort)

  const handleError = async (error: Error): Promise<boolean> => {
    if (options?.onError) {
      try {
        const result = await options.onError(error)
        return result !== false
      } catch {
        return true // Continue by default
      }
    }
    return true
  }

  try {
    while (!signal.aborted) {
      // Wrap reader.read() with timeout
      const chunk = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timeoutId = setTimeout(() => {
            const error = new SSETimeoutError(STREAM_TIMEOUT)
            reject(error)
          }, STREAM_TIMEOUT)
        }),
      ])

      if (timeoutId) clearTimeout(timeoutId)
      if (chunk.done) break

      buf += decoder.decode(chunk.value, { stream: true })
      buf = buf.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

      const chunks = buf.split("\n\n")
      buf = chunks.pop() ?? ""

      chunks.forEach((chunk) => {
        const data: string[] = []
        chunk.split("\n").forEach((line) => {
          if (line.startsWith("data:")) {
            data.push(line.replace(/^data:\s*/, ""))
            return
          }
          if (line.startsWith("id:")) {
            last = line.replace(/^id:\s*/, "")
            return
          }
          if (line.startsWith("retry:")) {
            const parsed = Number.parseInt(line.replace(/^retry:\s*/, ""), 10)
            if (!Number.isNaN(parsed)) retry = parsed
          }
        })

        if (!data.length) return
        const raw = data.join("\n")
        try {
          onEvent(JSON.parse(raw))
        } catch {
          onEvent({
            type: "sse.message",
            properties: {
              data: raw,
              id: last || undefined,
              retry,
            },
          })
        }
      })
    }
  } catch (error) {
    // Handle timeout errors gracefully
    if (error instanceof SSETimeoutError) {
      console.warn("SSE stream timeout - no data received for", STREAM_TIMEOUT / 1000, "seconds")

      // Allow caller to decide whether to continue
      if (options?.onTimeout) {
        try {
          const shouldContinue = await options.onTimeout()
          if (shouldContinue === false) {
            throw error
          }
          // Timeout was handled, don't throw - let caller reconnect
          return
        } catch (e) {
          if (e === error) throw error
          // onTimeout threw, treat as handled
          return
        }
      }
      throw error
    }

    // Handle other errors
    if (error instanceof Error) {
      const shouldContinue = await handleError(error)
      if (!shouldContinue) {
        throw error
      }
      console.warn("SSE stream error (handled):", error.message)
      return
    }

    // Unknown error type
    console.error("SSE stream error:", error)
    throw error
  } finally {
    signal.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}
