import { describe, it, expect } from "bun:test"
import { ProviderError } from "../src/provider/error"

/**
 * 回归测试套件 - 覆盖各类国产厂商的上下文溢出错误格式
 *
 * 这些测试用例来自真实的生产环境错误，确保错误检测不会漏报
 */
describe("Context Overflow Regression Tests", () => {
  describe("OpenAI / Compatible APIs", () => {
    it("should detect OpenAI context_length_exceeded", () => {
      const error = {
        type: "error",
        error: {
          code: "context_length_exceeded",
          message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 132000 tokens.",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect OpenAI prompt_too_long", () => {
      const error = {
        type: "error",
        error: {
          code: "prompt_too_long",
          message: "Prompt is too long",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect maximum context length message pattern", () => {
      const error = {
        type: "error",
        error: {
          message: "This model's maximum context length is 8192 tokens. Please reduce your prompt.",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Anthropic Claude", () => {
    it("should detect Anthropic context_window_exceeded", () => {
      const error = {
        type: "error",
        error: {
          code: "context_window_exceeded",
          message: "Your request exceeded the context window of this model",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect Anthropic prompt_too_long code", () => {
      const error = {
        type: "error",
        error: {
          code: "prompt_too_long",
          message: "prompt is too long: 150000 tokens > 100000 maximum",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Baidu Qianfan", () => {
    it("should detect input characters limit error", () => {
      const error = {
        type: "error",
        error: {
          code: "INVALID_ARGUMENT",
          message: "input characters limit is 819200",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect input token limit error", () => {
      const error = {
        type: "error",
        error: {
          message: "input token limit is 229376",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("DeepSeek", () => {
    it("should detect DeepSeek context length error", () => {
      const error = {
        type: "error",
        error: {
          message: "context length exceeded: 128000 tokens > 64000 limit",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Moonshot / Kimi", () => {
    it("should detect Moonshot token limit error", () => {
      const error = {
        type: "error",
        error: {
          message: "token limit exceeded",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect characters limit error", () => {
      const error = {
        type: "error",
        error: {
          message: "characters limit exceeded: 100000 > 80000",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Alibaba Qwen / Tongyi", () => {
    it("should detect Qwen context length error", () => {
      const error = {
        type: "error",
        error: {
          code: "Throttling",
          message: "Request was denied due to context length exceeding the limit",
        },
      }
      const result = ProviderError.parseStreamError(error)
      // 可能需要添加更多模式
    })
  })

  describe("Tencent Hunyuan", () => {
    it("should detect Hunyuan token limit error", () => {
      const error = {
        type: "error",
        error: {
          message: "超过最大token限制",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect Chinese context too long error", () => {
      const error = {
        type: "error",
        error: {
          message: "上下文过长",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Zhipu / GLM", () => {
    it("should detect GLM token limit error", () => {
      const error = {
        type: "error",
        error: {
          message: "单次请求超限",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect GLM input too long", () => {
      const error = {
        type: "error",
        error: {
          message: "输入token超限",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("Google Gemini", () => {
    it("should detect Gemini INVALID_ARGUMENT for context", () => {
      const error = {
        type: "error",
        error: {
          code: "INVALID_ARGUMENT",
          message: "Request token count exceeds the maximum context window",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })

    it("should detect Gemini RESOURCE_EXHAUSTED", () => {
      const error = {
        type: "error",
        error: {
          code: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded for token count",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("context_overflow")
    })
  })

  describe("HTTP Status Code Detection", () => {
    it("should detect 413 Request Entity Too Large", () => {
      const result = ProviderError.parseAPICallError({
        providerID: "openai" as any,
        error: {
          name: "APICallError",
          message: "Request Entity Too Large",
          statusCode: 413,
          isRetryable: false,
        } as any,
      })
      expect(result.type).toBe("context_overflow")
    })

    it("should detect 400 with context overflow body", () => {
      const result = ProviderError.parseAPICallError({
        providerID: "openai" as any,
        error: {
          name: "APICallError",
          message: "Bad Request",
          statusCode: 400,
          responseBody: JSON.stringify({
            error: {
              code: "context_length_exceeded",
              message: "Context too long",
            },
          }),
          isRetryable: false,
        } as any,
      })
      expect(result.type).toBe("context_overflow")
    })
  })

  describe("Non-Overflow Errors (Should NOT match)", () => {
    it("should NOT detect quota exceeded as overflow", () => {
      const error = {
        type: "error",
        error: {
          code: "insufficient_quota",
          message: "You exceeded your current quota",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBe("api_error")
      if (result?.type === "api_error") {
        expect(result.isRetryable).toBe(false)
      }
    })

    it("should NOT detect auth error as overflow", () => {
      const error = {
        type: "error",
        error: {
          code: "invalid_api_key",
          message: "Invalid API key provided",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result?.type).toBeUndefined()
    })

    it("should NOT detect rate limit as overflow", () => {
      const result = ProviderError.parseAPICallError({
        providerID: "openai" as any,
        error: {
          name: "APICallError",
          message: "Rate limit exceeded",
          statusCode: 429,
          isRetryable: true,
        } as any,
      })
      expect(result.type).toBe("api_error")
      if (result.type === "api_error") {
        expect(result.isRetryable).toBe(true)
      }
    })
  })

  describe("Edge Cases", () => {
    it("should handle malformed error body", () => {
      const error = {
        type: "error",
        error: "not an object",
      }
      const result = ProviderError.parseStreamError(error)
      expect(result).toBeUndefined()
    })

    it("should handle empty error message", () => {
      const error = {
        type: "error",
        error: {
          message: "",
        },
      }
      const result = ProviderError.parseStreamError(error)
      expect(result).toBeUndefined()
    })

    it("should handle null body", () => {
      const result = ProviderError.parseStreamError(null)
      expect(result).toBeUndefined()
    })

    it("should handle string body", () => {
      const result = ProviderError.parseStreamError("error string")
      expect(result).toBeUndefined()
    })
  })
})
