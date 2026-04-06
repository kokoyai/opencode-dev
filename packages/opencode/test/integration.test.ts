import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Token } from "../src/util/token"
import { SessionCompaction } from "../src/session/compaction"
import { LimitTracker } from "../src/provider/limit-tracker"
import { ProviderError } from "../src/provider/error"

/**
 * 集成测试 - 验证上下文溢出处理的完整流程
 *
 * 测试范围：
 * 1. Token估算 -> 压缩级别选择
 * 2. 错误检测 -> 限制记录 -> 有效限制计算
 * 3. 三级压缩策略的触发条件
 */
describe("Context Overflow Integration Tests", () => {
  describe("Token Estimation to Compaction Level Flow", () => {
    it("should select correct compaction level based on estimated tokens", () => {
      // 模拟一个200K上下文的模型
      const contextLimit = 200000

      // 测试不同token使用量下的压缩级别选择
      const testCases = [
        { tokens: 50000, expectedLevel: "none" as const }, // 25%
        { tokens: 140000, expectedLevel: "L1" as const }, // 70%
        { tokens: 160000, expectedLevel: "L2" as const }, // 80%
        { tokens: 180000, expectedLevel: "L3" as const }, // 90%
      ]

      for (const { tokens, expectedLevel } of testCases) {
        const result = SessionCompaction.selectCompactionLevel(tokens, contextLimit)
        expect(result.level).toBe(expectedLevel)
      }
    })

    it("should consider configurable thresholds", () => {
      const contextLimit = 100000

      // 使用自定义阈值
      const customL1 = 0.5
      const customL2 = 0.6
      const customL3 = 0.7

      // 55%应该触发L1（因为自定义阈值是50%）
      const result = SessionCompaction.selectCompactionLevel(
        55000,
        contextLimit,
        customL1,
        customL2,
        customL3,
      )
      expect(result.level).toBe("L1")
    })
  })

  describe("Error Detection to Limit Tracking Flow", () => {
    it("should track observed limits from overflow errors", () => {
      const providerID = "test-provider" as any

      // 模拟一个包含token限制的错误消息
      const errorMessage = "input token limit is 128000"

      // 记录观察到的限制
      LimitTracker.recordFromError(providerID, errorMessage)

      // 获取观察到的限制
      const observed = LimitTracker.getObservedLimit(providerID)
      expect(observed).toBe(128000)
    })

    it("should use observed limit when calculating effective limit", () => {
      const providerID = "test-provider-2" as any

      // 先记录一个观察值
      LimitTracker.recordFromError(providerID, "maximum context length is 64000")

      // 假设静态值是128000，但观察到的是64000
      const staticLimit = 128000
      const effective = LimitTracker.getEffectiveLimit(providerID, staticLimit)

      // 应该使用观察值（更小）
      expect(effective).toBeLessThanOrEqual(64000)
    })

    it("should handle multiple error formats", () => {
      const testCases = [
        { message: "maximum context length is 128000 tokens", expectedLimit: 128000 },
        { message: "input token limit is 229376", expectedLimit: 229376 },
        { message: "input characters limit is 819200", expectedLimit: 819200 },
        { message: "prompt is too long: 150000 tokens > 100000 maximum", expectedLimit: 100000 },
      ]

      for (const { message, expectedLimit } of testCases) {
        const providerID = `provider-${Math.random()}` as any
        LimitTracker.recordFromError(providerID, message)

        const observed = LimitTracker.getObservedLimit(providerID)
        expect(observed).toBe(expectedLimit)
      }
    })

    // 清理
    afterAll(() => {
      LimitTracker.clear()
    })
  })

  describe("Session State Extraction Flow", () => {
    it("should extract session state from messages", () => {
      const messages = [
        {
          info: {
            id: "msg-1",
            sessionID: "session-1",
            role: "user",
            time: { created: Date.now() },
          },
          parts: [
            {
              id: "part-1",
              sessionID: "session-1",
              messageID: "msg-1",
              type: "text",
              text: "Build a REST API for user management",
            },
            {
              id: "part-2",
              sessionID: "session-1",
              messageID: "msg-1",
              type: "file",
              filename: "/src/api/users.ts",
              mime: "text/plain",
              url: "file:///src/api/users.ts",
            },
          ],
        },
        {
          info: {
            id: "msg-2",
            sessionID: "session-1",
            role: "assistant",
            time: { created: Date.now() },
          },
          parts: [
            {
              id: "part-3",
              sessionID: "session-1",
              messageID: "msg-2",
              type: "tool",
              tool: "write_file",
              callID: "call-1",
              state: {
                status: "completed",
                input: { file_path: "/src/api/users.ts" },
                output: "File created successfully",
                title: "Write file",
                metadata: {},
                time: { start: Date.now(), end: Date.now() },
              },
            },
          ],
        },
      ] as any

      const state = SessionCompaction.extractSessionState(messages)

      // 应该提取到工作文件
      expect(state.workingFiles.length).toBeGreaterThan(0)
      expect(state.workingFiles).toContain("/src/api/users.ts")

      // 应该提取到目标
      expect(state.goal).toContain("REST API")
    })

    it("should convert session state to prompt", () => {
      const state: SessionCompaction.SessionStateBlock = {
        goal: "Build a REST API",
        instructions: ["Add error handling", "Use TypeScript"],
        workingFiles: ["/src/api/users.ts", "/src/api/auth.ts"],
        accomplished: ["Created user model"],
        discoveries: ["PostgreSQL is available"],
        extractedAt: Date.now(),
      }

      const prompt = SessionCompaction.sessionStateToPrompt(state)

      expect(prompt).toContain("Build a REST API")
      expect(prompt).toContain("Working Files")
      expect(prompt).toContain("/src/api/users.ts")
      expect(prompt).toContain("Important Instructions")
      expect(prompt).toContain("Add error handling")
    })
  })

  describe("End-to-End Error Handling Flow", () => {
    it("should parse and classify errors correctly", () => {
      const errorBodies = [
        {
          body: { type: "error", error: { code: "context_length_exceeded", message: "Too long" } },
          expectedType: "context_overflow" as const,
        },
        {
          body: { type: "error", error: { code: "insufficient_quota", message: "Quota exceeded" } },
          expectedType: "api_error" as const,
        },
        {
          body: { type: "error", error: { message: "This model's maximum context length is 8192 tokens" } },
          expectedType: "context_overflow" as const,
        },
      ]

      for (const { body, expectedType } of errorBodies) {
        const result = ProviderError.parseStreamError(body)
        expect(result?.type).toBe(expectedType)
      }
    })
  })

  describe("Token Estimation Accuracy", () => {
    it("should estimate tool call overhead correctly", () => {
      const simpleTool = Token.estimateToolCall({
        name: "read_file",
        args: { path: "/src/index.ts" },
      })

      const complexTool = Token.estimateToolCall({
        name: "edit_file",
        args: { path: "/src/index.ts", edits: [{ oldText: "a".repeat(1000), newText: "b".repeat(1000) }] },
        result: "File edited successfully with 10 changes",
      })

      // 复杂工具调用应该消耗更多token
      expect(complexTool).toBeGreaterThan(simpleTool)
    })

    it("should estimate image tokens based on size", () => {
      const smallImage = Token.estimateImageTokens(512, 512)
      const largeImage = Token.estimateImageTokens(2048, 2048)

      // 大图片应该消耗更多token
      expect(largeImage).toBeGreaterThan(smallImage)
      expect(smallImage).toBeGreaterThan(0)
    })

    it("should get appropriate thresholds for different context sizes", () => {
      const small = Token.getRecommendedThreshold(8000)
      const medium = Token.getRecommendedThreshold(64000)
      const large = Token.getRecommendedThreshold(200000)

      // 更大的上下文应该有更高的阈值
      expect(large.threshold).toBeGreaterThan(small.threshold)
      expect(medium.threshold).toBeGreaterThan(small.threshold)
    })
  })
})
