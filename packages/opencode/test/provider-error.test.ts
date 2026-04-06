import { describe, it, expect } from "bun:test"
import { ProviderError } from "../src/provider/error"
import { APICallError } from "ai"
import type { ProviderID } from "../src/provider/schema"

describe("ProviderError.parseStreamError", () => {
  it("should detect context overflow from error code", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        code: "context_length_exceeded",
        message: "The request exceeded the model's context length",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should detect context overflow from anthropic code", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        code: "context_window_exceeded",
        message: "Context too long",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should detect context overflow from message patterns", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        message: "This model's maximum context length is 8192 tokens",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should detect Chinese context overflow messages", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        message: "单次请求超过最大token限制",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should detect input token limit patterns", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        message: "input token limit is 229376",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should detect input characters limit patterns", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        message: "input characters limit is 819200",
      },
    })
    expect(result?.type).toBe("context_overflow")
  })

  it("should return undefined for non-error types", () => {
    const result = ProviderError.parseStreamError({
      type: "data",
      data: "some data",
    })
    expect(result).toBeUndefined()
  })

  it("should handle quota exceeded errors", () => {
    const result = ProviderError.parseStreamError({
      type: "error",
      error: {
        code: "insufficient_quota",
        message: "You exceeded your current quota",
      },
    })
    expect(result?.type).toBe("api_error")
    if (result?.type === "api_error") {
      expect(result.message).toContain("Quota exceeded")
    }
  })
})

describe("ProviderError.parseAPICallError", () => {
  const createError = (overrides: Partial<APICallError> = {}): APICallError => {
    // Create a mock error object that matches APICallError interface
    return {
      name: "APICallError",
      message: overrides.message ?? "Test error",
      statusCode: overrides.statusCode ?? 400,
      responseBody: overrides.responseBody,
      isRetryable: overrides.isRetryable ?? false,
      responseHeaders: overrides.responseHeaders,
      url: overrides.url,
    } as unknown as APICallError
  }

  it("should detect context overflow from 413 status", () => {
    const error = createError({ statusCode: 413 })
    const result = ProviderError.parseAPICallError({
      providerID: "openai" as ProviderID,
      error,
    })
    expect(result.type).toBe("context_overflow")
  })

  it("should detect context overflow from error code in body", () => {
    const error = createError({
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          code: "context_length_exceeded",
          message: "Context too long",
        },
      }),
    })
    const result = ProviderError.parseAPICallError({
      providerID: "openai" as ProviderID,
      error,
    })
    expect(result.type).toBe("context_overflow")
  })

  it("should detect context overflow from message in body", () => {
    const error = createError({
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message: "This model's maximum context length is 128000 tokens",
        },
      }),
    })
    const result = ProviderError.parseAPICallError({
      providerID: "openai" as ProviderID,
      error,
    })
    expect(result.type).toBe("context_overflow")
  })

  it("should return api_error for non-overflow errors", () => {
    const error = createError({
      statusCode: 500,
      message: "Internal server error",
    })
    const result = ProviderError.parseAPICallError({
      providerID: "openai" as ProviderID,
      error,
    })
    expect(result.type).toBe("api_error")
    if (result.type === "api_error") {
      expect(result.isRetryable).toBe(false)
    }
  })

  it("should handle rate limit errors", () => {
    const error = createError({
      statusCode: 429,
      message: "Rate limit exceeded",
    })
    const result = ProviderError.parseAPICallError({
      providerID: "openai" as ProviderID,
      error,
    })
    expect(result.type).toBe("api_error")
  })
})
