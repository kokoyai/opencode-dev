import { describe, it, expect } from "bun:test"
import { Token } from "../src/util/token"

describe("Token Estimation", () => {
  describe("estimate", () => {
    it("should estimate tokens from string", () => {
      // Roughly 4 chars per token
      expect(Token.estimate("hello")).toBe(1) // 5 chars / 4 = 1.25 ≈ 1
      expect(Token.estimate("hello world")).toBe(3) // 11 chars / 4 = 2.75 ≈ 3
      expect(Token.estimate("")).toBe(0)
      expect(Token.estimate("a".repeat(100))).toBe(25) // 100 / 4 = 25
    })

    it("should handle null/undefined", () => {
      expect(Token.estimate(null as any)).toBe(0)
      expect(Token.estimate(undefined as any)).toBe(0)
    })
  })

  describe("estimateToolCall", () => {
    it("should estimate tool call overhead", () => {
      const result = Token.estimateToolCall({
        name: "read_file",
        args: { path: "/src/index.ts" },
      })
      expect(result).toBeGreaterThan(0)
    })

    it("should include result tokens", () => {
      const withoutResult = Token.estimateToolCall({
        name: "read_file",
        args: { path: "/src/index.ts" },
      })
      const withResult = Token.estimateToolCall({
        name: "read_file",
        args: { path: "/src/index.ts" },
        result: "This is a very long file content...",
      })
      expect(withResult).toBeGreaterThan(withoutResult)
    })

    it("should apply overhead multiplier", () => {
      const simple = Token.estimateToolCall({
        name: "test",
        args: {},
      })
      expect(simple).toBeGreaterThanOrEqual(Token.TOOL_CALL_OVERHEAD.base)
    })
  })

  describe("estimateReasoning", () => {
    it("should estimate reasoning tokens", () => {
      const result = Token.estimateReasoning("Thinking about this problem...")
      expect(result).toBeGreaterThan(0)
    })

    it("should respect budget limit", () => {
      const longText = "a".repeat(100000)
      const budget = 1000
      const result = Token.estimateReasoning(longText, budget)
      // Should be capped at budget * 0.9
      expect(result).toBeLessThanOrEqual(budget)
    })
  })

  describe("estimateImageTokens", () => {
    it("should estimate image tokens", () => {
      // 1024x1024 image
      const result = Token.estimateImageTokens(1024, 1024)
      expect(result).toBeGreaterThan(0)
    })

    it("should scale with image size", () => {
      const small = Token.estimateImageTokens(512, 512)
      const large = Token.estimateImageTokens(2048, 2048)
      expect(large).toBeGreaterThan(small)
    })
  })

  describe("estimatePdfTokens", () => {
    it("should estimate PDF tokens by pages", () => {
      const result = Token.estimatePdfTokens(10)
      expect(result).toBe(7500) // 10 pages * 750 tokens
    })
  })

  describe("estimateMessageOverhead", () => {
    it("should calculate message structure overhead", () => {
      const result = Token.estimateMessageOverhead(5)
      expect(result).toBeGreaterThan(0)
    })

    it("should increase with more parts", () => {
      const fewer = Token.estimateMessageOverhead(2)
      const more = Token.estimateMessageOverhead(10)
      expect(more).toBeGreaterThan(fewer)
    })
  })

  describe("getRecommendedThreshold", () => {
    it("should return 50% for very small context", () => {
      const result = Token.getRecommendedThreshold(8000)
      expect(result.threshold).toBe(0.5)
    })

    it("should return 55% for small context", () => {
      const result = Token.getRecommendedThreshold(20000)
      expect(result.threshold).toBe(0.55)
    })

    it("should return 60% for medium context", () => {
      const result = Token.getRecommendedThreshold(64000)
      expect(result.threshold).toBe(0.6)
    })

    it("should return 65% for large context", () => {
      const result = Token.getRecommendedThreshold(128000)
      expect(result.threshold).toBe(0.65)
    })

    it("should return 70% for very large context", () => {
      const result = Token.getRecommendedThreshold(200000)
      expect(result.threshold).toBe(0.7)
    })

    it("should include reason", () => {
      const result = Token.getRecommendedThreshold(128000)
      expect(result.reason).toContain("65%")
    })
  })
})
