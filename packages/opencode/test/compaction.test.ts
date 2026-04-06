import { describe, it, expect } from "bun:test"
import { SessionCompaction } from "../src/session/compaction"
import type { MessageV2 } from "../src/session/message-v2"

const {
  selectCompactionLevel,
  extractSessionState,
  sessionStateToPrompt,
  L1_LIGHT,
  L2_MEDIUM,
  L3_HARD,
} = SessionCompaction

describe("Compaction Level Selection", () => {
  it("should return 'none' when usage is below L1 threshold", () => {
    const result = selectCompactionLevel(50000, 200000) // 25% usage
    expect(result.level).toBe("none")
  })

  it("should return 'L1' when usage is between L1 and L2 threshold", () => {
    const result = selectCompactionLevel(140000, 200000) // 70% usage
    expect(result.level).toBe("L1")
  })

  it("should return 'L2' when usage is between L2 and L3 threshold", () => {
    const result = selectCompactionLevel(160000, 200000) // 80% usage
    expect(result.level).toBe("L2")
  })

  it("should return 'L3' when usage is above L3 threshold", () => {
    const result = selectCompactionLevel(180000, 200000) // 90% usage
    expect(result.level).toBe("L3")
  })

  it("should include reason in result", () => {
    const result = selectCompactionLevel(180000, 200000)
    expect(result.reason).toContain("90.0%")
    expect(result.reason).toContain("硬截断")
  })

  it("should use correct thresholds", () => {
    expect(L1_LIGHT.threshold).toBe(0.65)
    expect(L2_MEDIUM.threshold).toBe(0.75)
    expect(L3_HARD.threshold).toBe(0.85)
  })
})

describe("Session State Extraction", () => {
  const createMockMessage = (
    role: "user" | "assistant",
    parts: Partial<MessageV2.Part>[],
  ): MessageV2.WithParts => {
    const sessionId = "test-session" as any
    const messageId = `msg-${Date.now()}-${Math.random()}` as any
    return {
      info: {
        id: messageId,
        sessionID: sessionId,
        role,
        time: { created: Date.now() },
        agent: "test",
        model: { providerID: "test" as any, modelID: "test-model" as any },
      } as any,
      parts: parts.map((p, i) => ({
        id: `part-${i}` as any,
        sessionID: sessionId,
        messageID: messageId,
        ...p,
      })) as any,
    }
  }

  it("should extract working files from file parts", () => {
    const messages = [
      createMockMessage("user", [
        { type: "file", filename: "/src/index.ts", mime: "text/plain", url: "file:///src/index.ts" },
      ]),
    ]

    const state = extractSessionState(messages)
    expect(state.workingFiles).toContain("/src/index.ts")
  })

  it("should extract working files from tool arguments", () => {
    const messages = [
      createMockMessage("assistant", [
        {
          type: "tool",
          tool: "read_file",
          callID: "call-1",
          state: {
            status: "completed",
            input: { file_path: "/src/main.ts" },
            output: "file content",
            title: "Read file",
            metadata: {},
            time: { start: Date.now(), end: Date.now() },
          },
        },
      ]),
    ]

    const state = extractSessionState(messages)
    expect(state.workingFiles).toContain("/src/main.ts")
  })

  it("should deduplicate files", () => {
    const messages = [
      createMockMessage("user", [
        { type: "file", filename: "/src/index.ts", mime: "text/plain", url: "file:///src/index.ts" },
      ]),
      createMockMessage("assistant", [
        {
          type: "tool",
          tool: "read_file",
          callID: "call-1",
          state: {
            status: "completed",
            input: { file_path: "/src/index.ts" },
            output: "content",
            title: "Read",
            metadata: {},
            time: { start: Date.now(), end: Date.now() },
          },
        },
      ]),
    ]

    const state = extractSessionState(messages)
    expect(state.workingFiles.filter((f) => f === "/src/index.ts")).toHaveLength(1)
  })

  it("should extract instructions with keywords", () => {
    const messages = [
      createMockMessage("user", [{ type: "text", text: "Make sure to add error handling" }]),
    ]

    const state = extractSessionState(messages)
    expect(state.instructions.length).toBeGreaterThan(0)
    expect(state.instructions[0]).toContain("error handling")
  })

  it("should limit the number of files", () => {
    const parts = Array.from({ length: 30 }, (_, i) => ({
      type: "file" as const,
      filename: `/src/file${i}.ts`,
      mime: "text/plain",
      url: `file:///src/file${i}.ts`,
    }))
    const messages = [createMockMessage("user", parts)]

    const state = extractSessionState(messages)
    expect(state.workingFiles.length).toBeLessThanOrEqual(20)
  })

  it("should set extractedAt timestamp", () => {
    const messages = [createMockMessage("user", [{ type: "text", text: "Hello" }])]
    const before = Date.now()
    const state = extractSessionState(messages)
    const after = Date.now()
    expect(state.extractedAt).toBeGreaterThanOrEqual(before)
    expect(state.extractedAt).toBeLessThanOrEqual(after)
  })
})

describe("Session State to Prompt", () => {
  it("should return empty string for empty state", () => {
    const state: SessionCompaction.SessionStateBlock = {
      instructions: [],
      workingFiles: [],
      accomplished: [],
      discoveries: [],
      extractedAt: Date.now(),
    }
    const result = sessionStateToPrompt(state)
    expect(result).toBe("")
  })

  it("should include goal when present", () => {
    const state: SessionCompaction.SessionStateBlock = {
      goal: "Build a REST API",
      instructions: [],
      workingFiles: [],
      accomplished: [],
      discoveries: [],
      extractedAt: Date.now(),
    }
    const result = sessionStateToPrompt(state)
    expect(result).toContain("Build a REST API")
    expect(result).toContain("Original Goal")
  })

  it("should include working files", () => {
    const state: SessionCompaction.SessionStateBlock = {
      instructions: [],
      workingFiles: ["/src/index.ts", "/src/main.ts"],
      accomplished: [],
      discoveries: [],
      extractedAt: Date.now(),
    }
    const result = sessionStateToPrompt(state)
    expect(result).toContain("Working Files")
    expect(result).toContain("/src/index.ts")
    expect(result).toContain("/src/main.ts")
  })

  it("should include instructions", () => {
    const state: SessionCompaction.SessionStateBlock = {
      instructions: ["Add error handling", "Use TypeScript"],
      workingFiles: [],
      accomplished: [],
      discoveries: [],
      extractedAt: Date.now(),
    }
    const result = sessionStateToPrompt(state)
    expect(result).toContain("Important Instructions")
    expect(result).toContain("Add error handling")
    expect(result).toContain("Use TypeScript")
  })

  it("should include timestamp", () => {
    const state: SessionCompaction.SessionStateBlock = {
      instructions: [],
      workingFiles: ["/src/test.ts"],
      accomplished: [],
      discoveries: [],
      extractedAt: 1700000000000,
    }
    const result = sessionStateToPrompt(state)
    expect(result).toContain("Session State Preserved")
  })
})
