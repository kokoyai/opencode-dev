export class TimeoutError extends Error {
  constructor(
    public readonly ms: number,
    public readonly operation?: string,
  ) {
    super(`Operation${operation ? ` "${operation}"` : ""} timed out after ${ms}ms`)
    this.name = "TimeoutError"
  }
}

export interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  exponentialBackoff?: boolean
  shouldRetry?: (error: Error) => boolean
}

export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number
  /** Optional operation name for error messages */
  operation?: string
  /** Called when timeout occurs. Return false to suppress error, or throw to use custom error. */
  onTimeout?: (ms: number, operation?: string) => boolean | void | Promise<boolean | void>
}

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't resolve within the specified time, throws a TimeoutError.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, operation?: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let settled = false

  return Promise.race([
    promise
      .then((result) => {
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        return result
      })
      .catch((error) => {
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        throw error
      }),
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (settled) return
        reject(new TimeoutError(ms, operation))
      }, ms)
    }),
  ])
}

/**
 * Wraps a promise with a timeout and customizable timeout handling.
 */
export async function withTimeoutOptions<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let settled = false

  try {
    const result = await Promise.race([
      promise
        .then((r) => {
          settled = true
          return r
        })
        .catch((e) => {
          settled = true
          throw e
        }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(async () => {
          if (settled) return
          try {
            if (options.onTimeout) {
              const shouldContinue = await options.onTimeout(options.timeoutMs, options.operation)
              if (shouldContinue === false) {
                // Caller handled timeout, don't reject
                // This creates a pending promise that never resolves
                return
              }
            }
            reject(new TimeoutError(options.timeoutMs, options.operation))
          } catch (e) {
            reject(e)
          }
        }, options.timeoutMs)
      }),
    ])
    return result
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, exponentialBackoff = true, shouldRetry } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) break

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError)) break

      // Calculate delay with exponential backoff
      const delay = exponentialBackoff ? retryDelay * Math.pow(2, attempt) : retryDelay

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function withTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation: string,
  retryOptions?: RetryOptions,
): Promise<T> {
  return withRetry(() => withTimeout(fn(), timeoutMs, operation), {
    shouldRetry: (error) => error instanceof TimeoutError,
    ...retryOptions,
  })
}
