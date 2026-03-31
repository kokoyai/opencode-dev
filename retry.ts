import type { NamedError } from "@opencode-ai/util/error"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"

export namespace SessionRetry {
  export type Err = ReturnType<NamedError["toObject"]>

  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_BACKOFF_FACTOR = 1
  export const RETRY_MAX_DELAY_NO_HEADERS = 2000
  export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout

  function cap(ms: number) {
    return Math.min(ms, RETRY_MAX_DELAY)
  }

  export function delay(attempt: number, error?: MessageV2.APIError) {
    return cap(RETRY_INITIAL_DELAY)
  }

  export function retryable(error: Err) {
    // Keep hard failures that cannot self-heal out of the retry loop.
    if (MessageV2.ContextOverflowError.isInstance(error)) return undefined

    // Force retry every provider/API failure, even when the SDK marks it as non-retryable.
    if (MessageV2.APIError.isInstance(error)) {
      if (error.data.responseBody?.includes("FreeUsageLimitError"))
        return `Free usage exceeded, add credits https://opencode.ai/zen`
      return error.data.message || "Model request failed"
    }

    // Some providers throw plain Error / NamedError before they are normalized into APIError.
    // Retry them as well so the session loop never stops on transient model-side failures.
    if (typeof error.data?.message === "string" && error.data.message.trim()) {
      return error.data.message
    }

    return undefined
  }

  export function policy(opts: {
    parse: (error: unknown) => Err
    set: (input: { attempt: number; message: string; next: number }) => Effect.Effect<void>
  }) {
    return Schedule.fromStepWithMetadata(
      Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
        const error = opts.parse(meta.input)
        const message = retryable(error)
        if (!message) return Cause.done(meta.attempt)
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
