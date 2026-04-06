import type { NamedError } from "@opencode-ai/util/error"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { iife } from "@/util/iife"
import type { Config } from "@/config/config"

export type FallbackErrorType = "rate_limit" | "overloaded" | "timeout" | "5xx" | "context_overflow"

export namespace SessionRetry {
  export type Err = ReturnType<NamedError["toObject"]>

  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_MAX_DELAY = 2000 // fixed delay, always 2s
  export const RETRY_MAX_ATTEMPTS = 9999999 // Maximum retry attempts before giving up

  export function delay(_attempt: number, _error?: MessageV2.APIError) {
    return RETRY_INITIAL_DELAY // always return 2s
  }

  export function retryable(error: Err) {
    // context overflow errors should not be retried
    if (MessageV2.ContextOverflowError.isInstance(error)) return undefined
    if (MessageV2.APIError.isInstance(error)) {
      if (!error.data.isRetryable) return undefined
      if (error.data.responseBody?.includes("FreeUsageLimitError"))
        return `Free usage exceeded, add credits https://opencode.ai/zen`
      return error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message
    }

    const json = iife(() => {
      try {
        if (typeof error.data?.message === "string") {
          const parsed = JSON.parse(error.data.message)
          return parsed
        }

        return JSON.parse(error.data.message)
      } catch {
        return undefined
      }
    })
    if (!json || typeof json !== "object") return undefined
    const code = typeof json.code === "string" ? json.code : ""

    if (json.type === "error" && json.error?.type === "too_many_requests") {
      return "Too Many Requests"
    }
    if (code.includes("exhausted") || code.includes("unavailable")) {
      return "Provider is overloaded"
    }
    if (json.type === "error" && typeof json.error?.code === "string" && json.error.code.includes("rate_limit")) {
      return "Rate Limited"
    }
    return undefined
  }

  /**
   * Determine if error should trigger model fallback
   */
  export function shouldFallback(error: Err, onErrors: FallbackErrorType[]): boolean {
    if (!onErrors.length) return false

    // Context overflow
    if (MessageV2.ContextOverflowError.isInstance(error)) {
      return onErrors.includes("context_overflow")
    }

    if (MessageV2.APIError.isInstance(error)) {
      const msg = error.data.message.toLowerCase()
      const body = error.data.responseBody?.toLowerCase() ?? ""
      const status = error.data.statusCode

      // Rate limit
      if (onErrors.includes("rate_limit")) {
        if (body.includes("rate_limit") || body.includes("rate limit") || body.includes("too_many_requests")) {
          return true
        }
        if (msg.includes("rate limit") || msg.includes("429")) {
          return true
        }
        if (status === 429) return true
      }

      // Overloaded
      if (onErrors.includes("overloaded")) {
        if (msg.includes("overloaded") || body.includes("overloaded")) return true
        if (msg.includes("exhausted") || body.includes("exhausted")) return true
        if (msg.includes("unavailable") || body.includes("unavailable")) return true
      }

      // Timeout
      if (onErrors.includes("timeout")) {
        if (msg.includes("timeout") || body.includes("timeout")) return true
        if (msg.includes("timed out") || body.includes("timed out")) return true
      }

      // 5xx server errors
      if (onErrors.includes("5xx") && status) {
        if (status >= 500 && status < 600) return true
      }
    }

    return false
  }

  export function policy(opts: {
    parse: (error: unknown) => Err
    set: (input: { attempt: number; message: string; next: number }) => Effect.Effect<void>
  }) {
    return Schedule.fromStepWithMetadata(
      Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
        const error = opts.parse(meta.input)
        const message = retryable(error)

        // Stop if not retryable or max attempts reached
        if (!message) return Cause.done(meta.attempt)
        if (meta.attempt >= RETRY_MAX_ATTEMPTS) {
          return Cause.done(meta.attempt)
        }

        return Effect.gen(function* () {
          const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined)
          const now = yield* Clock.currentTimeMillis
          yield* opts.set({ attempt: meta.attempt, message, next: now + wait })
          return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
        })
      }),
    )
  }
}
