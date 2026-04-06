import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import type { ProviderID } from "./schema"

export namespace ProviderError {
  // ============================================================
  // 1. 结构化错误码定义（优先级最高）
  // ============================================================

  // OpenAI / 兼容格式的错误码
  const OPENAI_OVERFLOW_CODES = new Set([
    "context_length_exceeded",
    "max_context_length_exceeded",
    "prompt_too_long",
    "input_too_long",
    "token_limit_exceeded",
    "max_tokens_exceeded",
    "content_length_exceeded",
    "request_too_large",
  ])

  // Anthropic 错误码
  const ANTHROPIC_OVERFLOW_CODES = new Set([
    "prompt_too_long",
    "context_window_exceeded",
    "max_context_window",
  ])

  // Google/Gemini 错误码
  const GOOGLE_OVERFLOW_CODES = new Set([
    "INVALID_ARGUMENT",
    "RESOURCE_EXHAUSTED",
  ])

  // HTTP 状态码
  const OVERFLOW_STATUS_CODES = new Set([413, 400])

  // ============================================================
  // 2. 结构化字段检查函数
  // ============================================================

  function checkErrorCode(body: any): boolean {
    const code = body?.error?.code || body?.code || body?.error_code
    if (!code || typeof code !== "string") return false

    const codeLower = code.toLowerCase()

    // OpenAI style
    if (OPENAI_OVERFLOW_CODES.has(codeLower)) return true

    // Anthropic style
    if (ANTHROPIC_OVERFLOW_CODES.has(codeLower)) return true

    // Google style - need to check message for context-related content
    if (GOOGLE_OVERFLOW_CODES.has(code)) {
      const msg = body?.error?.message || body?.message || ""
      if (typeof msg === "string" && (
        msg.toLowerCase().includes("context") ||
        msg.toLowerCase().includes("token") ||
        msg.toLowerCase().includes("length") ||
        msg.toLowerCase().includes("window") ||
        msg.toLowerCase().includes("exceed")
      )) return true
    }

    // Check for context/length related codes
    if (codeLower.includes("context") && codeLower.includes("exceed")) return true
    if (codeLower.includes("length") && codeLower.includes("exceed")) return true
    if (codeLower.includes("token") && codeLower.includes("limit")) return true
    if (codeLower.includes("prompt") && codeLower.includes("long")) return true

    return false
  }

  function checkStructuredFields(body: any): boolean {
    // OpenAI style: error.param or error.type indicates context issue
    if (body?.error?.param === "messages") return true
    if (body?.error?.type === "invalid_request_error") {
      const msg = body?.error?.message || ""
      if (typeof msg === "string" && (
        msg.includes("context") ||
        msg.includes("token") ||
        msg.includes("length")
      )) return true
    }

    // Check for usage fields that indicate overflow
    if (body?.usage?.total_tokens && body?.usage?.max_tokens) {
      if (body.usage.total_tokens > body.usage.max_tokens) return true
    }

    // Check for specific provider fields
    // DeepSeek
    if (body?.error?.message?.includes("context length")) return true

    // Kimi/Moonshot
    if (typeof body?.error?.message === "string") {
      const msg = body.error.message
      if (msg.includes("token limit") || msg.includes("characters limit")) return true
    }

    // Google Gemini
    if (typeof body?.error?.message === "string") {
      const msg = body.error.message.toLowerCase()
      if (msg.includes("token count exceeds") || msg.includes("context window")) return true
    }

    return false
  }

  // ============================================================
  // 3. 正则模式（仅作为 fallback）
  // ============================================================

  const OVERFLOW_PATTERNS = [
    // Error Code patterns (highest confidence)
    /context_length_exceeded/i,
    /model_context_window_exceeded/i,

    // "maximum context length" patterns
    /this model'?s maximum context length is \d+/i,
    /maximum context length is \d+ tokens/i,
    /maximum context length exceeded/i,

    // Token limit patterns
    /input token limit is \d+/i,
    /input characters limit is \d+/i,
    /prompt is too long: \d+ tokens? > \d+/i,
    /your request exceeded model token limit/i,
    /token limit exceeded/i,
    /characters limit exceeded/i,

    // "exceeds context" patterns
    /exceeds the context window/i,
    /is longer than the model'?s context length/i,
    /exceeds the available context size/i,
    /request token count exceeds/i,
    /exceeds the maximum number of tokens/i,

    // Status code in message (when proxy returns wrong statusCode)
    // Cerebras and Mistral often return "400 (no body)" / "413 (no body)" for overflow
    /^4(00|13)\s*(status code)?\s*\(no body\)/i,

    // Generic patterns (lower confidence)
    /prompt is too long/i,
    /input is too long/i,
    /too large for model/i,
    /reduce the length of the messages/i,

    // Chinese patterns
    /超过.{0,10}最大.{0,10}(长度|token)/,
    /上下文.{0,5}(过长|太长|超出)/,
    /单次(请求|输入).{0,10}(超限|超过|超出)/,
    /token.*超限/,
    /输入token超限/,
  ]

  // ============================================================
  // 4. 核心判定函数（结构化优先）
  // ============================================================

  function isOverflowByStructure(
    statusCode: number | undefined,
    body: any,
    errorMessage: string
  ): boolean {
    // Step 1: HTTP 状态码判断
    if (statusCode === 413) return true

    // Step 2: 结构化错误码判断
    if (checkErrorCode(body)) return true

    // Step 3: 结构化字段判断
    if (checkStructuredFields(body)) return true

    // Step 4: 特殊情况 - 400 状态码需要检查 body
    if (statusCode === 400) {
      // Check if body has overflow indicators
      if (body?.error?.message) {
        const msg = body.error.message
        if (msg.includes("context") || msg.includes("token") || msg.includes("length")) {
          // Further validate it's about overflow, not other 400 errors
          if (OVERFLOW_PATTERNS.some(p => p.test(msg))) return true
        }
      }
    }

    return false
  }

  function isOverflowByPattern(message: string): boolean {
    return OVERFLOW_PATTERNS.some(p => p.test(message))
  }

  function isOpenAiErrorRetryable(e: APICallError) {
    const status = e.statusCode
    if (!status) return e.isRetryable
    return status === 404 || e.isRetryable
  }

  function message(providerID: ProviderID, e: APICallError) {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody)
        const errMsg = body.message || body.error || body.error?.message
        if (errMsg && typeof errMsg === "string") {
          return `${msg}: ${errMsg}`
        }
      } catch {}

      if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
        if (e.statusCode === 401) {
          return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired."
        }
        if (e.statusCode === 403) {
          return "Forbidden: request was blocked by a gateway or proxy."
        }
        return msg
      }

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown) {
    if (typeof input === "string") {
      try {
        const result = JSON.parse(input)
        if (result && typeof result === "object") return result
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input
    }
    return undefined
  }

  // ============================================================
  // 5. 公开 API
  // ============================================================

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: false
        responseBody: string
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = json(input)
    if (!body) return

    const responseBody = JSON.stringify(body)
    if (body.type !== "error") return

    const errorMessage = body?.error?.message || body?.message || ""

    // Step 1: Check error code (structured)
    if (checkErrorCode(body)) {
      return {
        type: "context_overflow",
        message: errorMessage || "Input exceeds context window of this model",
        responseBody,
      }
    }

    // Step 2: Check structured fields
    if (checkStructuredFields(body)) {
      return {
        type: "context_overflow",
        message: errorMessage,
        responseBody,
      }
    }

    // Step 3: Fallback to pattern matching
    if (isOverflowByPattern(errorMessage)) {
      return {
        type: "context_overflow",
        message: errorMessage,
        responseBody,
      }
    }

    // Handle other specific error codes
    switch (body?.error?.code) {
      case "insufficient_quota":
        return {
          type: "api_error",
          message: "Quota exceeded. Check your plan and billing details.",
          isRetryable: false,
          responseBody,
        }
      case "usage_not_included":
        return {
          type: "api_error",
          message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
          isRetryable: false,
          responseBody,
        }
      case "invalid_prompt":
        return {
          type: "api_error",
          message: typeof body?.error?.message === "string" ? body.error.message : "Invalid prompt.",
          isRetryable: false,
          responseBody,
        }
    }
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  export function parseAPICallError(input: { providerID: ProviderID; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    const body = json(input.error.responseBody)
    const statusCode = input.error.statusCode
    const errorMessage = body?.error?.message || body?.message || ""

    // Step 1: HTTP 状态码判断 (413 = Request Entity Too Large)
    if (statusCode === 413) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    // Step 2: 结构化错误码判断
    if (checkErrorCode(body)) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    // Step 3: 结构化字段判断
    if (isOverflowByStructure(statusCode, body, errorMessage)) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    // Step 4: 正则兜底
    if (isOverflowByPattern(m) || isOverflowByPattern(errorMessage)) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const metadata = input.error.url ? { url: input.error.url } : undefined
    return {
      type: "api_error",
      message: m,
      statusCode: statusCode,
      isRetryable: input.providerID.startsWith("openai")
        ? isOpenAiErrorRetryable(input.error)
        : input.error.isRetryable,
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata,
    }
  }
}
