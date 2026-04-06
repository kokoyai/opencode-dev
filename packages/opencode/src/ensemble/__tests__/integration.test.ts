import { describe, it, expect, beforeEach, mock } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { mergeToolCalls, extractToolCalls, resolveConflicts } from "../tool-merger"
import type { ToolCallEvent, ToolCallConflict, MergedToolCall } from "../tool-merger"

describe("Tool Merger - Extended Tests", () => {
  describe("extractToolCalls", () => {
    it("should correctly separate calls from both models", () => {
      const events = [
        {
          source: "modelA" as const,
          event: { type: "tool-call", toolCallId: "a1", toolName: "read", input: { path: "/file1" } },
        },
        {
          source: "modelB" as const,
          event: { type: "tool-call", toolCallId: "b1", toolName: "read", input: { path: "/file2" } },
        },
        {
          source: "modelA" as const,
          event: { type: "tool-call", toolCallId: "a2", toolName: "bash", input: { command: "ls" } },
        },
        {
          source: "modelB" as const,
          event: { type: "text-delta", text: "Hello" },
        },
      ]

      const { callsA, callsB } = extractToolCalls(events as any)

      expect(callsA).toHaveLength(2)
      expect(callsB).toHaveLength(1)
      expect(callsA[0].toolName).toBe("read")
      expect(callsA[1].toolName).toBe("bash")
      expect(callsB[0].toolName).toBe("read")
    })

    it("should handle empty events", () => {
      const { callsA, callsB } = extractToolCalls([])
      expect(callsA).toHaveLength(0)
      expect(callsB).toHaveLength(0)
    })
  })

  describe("mergeToolCalls", () => {
    it("should mark high confidence when both models agree", async () => {
      const callsA: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "a1", toolName: "read", input: { path: "/same" } },
      ]
      const callsB: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "b1", toolName: "read", input: { path: "/same" } },
      ]

      const result = await Effect.runPromise(mergeToolCalls(callsA, callsB))

      expect(result.merged).toHaveLength(1)
      expect(result.merged[0].confidence).toBe("high")
      expect(result.merged[0].sources).toContain("modelA")
      expect(result.merged[0].sources).toContain("modelB")
    })

    it("should detect conflicts when inputs differ", async () => {
      const callsA: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "a1", toolName: "edit", input: { file: "a.ts" } },
      ]
      const callsB: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "b1", toolName: "edit", input: { file: "b.ts" } },
      ]

      const result = await Effect.runPromise(mergeToolCalls(callsA, callsB))

      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].reason).toBe("different-input")
      expect(result.strategy).toBe("judge-required")
    })

    it("should mark medium confidence when only one model calls a tool", async () => {
      const callsA: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "a1", toolName: "bash", input: { cmd: "test" } },
      ]
      const callsB: ToolCallEvent[] = []

      const result = await Effect.runPromise(mergeToolCalls(callsA, callsB))

      expect(result.merged).toHaveLength(1)
      expect(result.merged[0].confidence).toBe("medium")
      expect(result.merged[0].sources).toEqual(["modelA"])
    })

    it("should handle multiple different tools from both models", async () => {
      const callsA: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "a1", toolName: "read", input: { path: "/a" } },
        { type: "tool-call", toolCallId: "a2", toolName: "bash", input: { cmd: "ls" } },
      ]
      const callsB: ToolCallEvent[] = [
        { type: "tool-call", toolCallId: "b1", toolName: "write", input: { path: "/b" } },
        { type: "tool-call", toolCallId: "b2", toolName: "glob", input: { pattern: "*.ts" } },
      ]

      const result = await Effect.runPromise(mergeToolCalls(callsA, callsB))

      expect(result.merged).toHaveLength(4)
      expect(result.strategy).toBe("auto-merge")
    })
  })

  describe("resolveConflicts", () => {
    it("should use model A when resolution is useA", () => {
      const merged: MergedToolCall[] = []
      const conflicts: ToolCallConflict[] = [
        {
          toolName: "edit",
          calls: [
            { source: "modelA", event: { type: "tool-call", toolCallId: "a1", toolName: "edit", input: { file: "a" } } as any },
            { source: "modelB", event: { type: "tool-call", toolCallId: "b1", toolName: "edit", input: { file: "b" } } as any },
          ],
          reason: "different-input",
        },
      ]
      const resolutions = [
        { conflict: conflicts[0], resolution: "useA" as const, reasoning: "A is more accurate" },
      ]

      const result = resolveConflicts(merged, conflicts, resolutions)

      expect(result).toHaveLength(1)
      expect(result[0].input).toEqual({ file: "a" })
    })

    it("should use both models when resolution is useBoth", () => {
      const merged: MergedToolCall[] = []
      const conflicts: ToolCallConflict[] = [
        {
          toolName: "read",
          calls: [
            { source: "modelA", event: { type: "tool-call", toolCallId: "a1", toolName: "read", input: { path: "/a" } } as any },
            { source: "modelB", event: { type: "tool-call", toolCallId: "b1", toolName: "read", input: { path: "/b" } } as any },
          ],
          reason: "different-input",
        },
      ]
      const resolutions = [
        { conflict: conflicts[0], resolution: "useBoth" as const, reasoning: "Both files relevant" },
      ]

      const result = resolveConflicts(merged, conflicts, resolutions)

      expect(result).toHaveLength(2)
      expect(result[0].confidence).toBe("low")
      expect(result[1].confidence).toBe("low")
    })
  })
})

describe("Ensemble Integration Tests", () => {
  describe("Configuration Integration", () => {
    it("should have valid default models", () => {
      const config = {
        enabled: true,
        models: ["glm-5", "kimi-k2.5"] as [string, string],
        judgeModel: "kimi-k2.5",
      }

      expect(config.models).toHaveLength(2)
      expect(config.models[0]).not.toBe(config.models[1])
    })
  })

  describe("Event Flow", () => {
    it("should simulate dual model event flow", async () => {
      // Simulate events from both models
      const eventsFromA = [
        { type: "text-delta", text: "Hello" },
        { type: "tool-call", toolCallId: "a1", toolName: "read", input: { path: "/test" } },
      ]
      const eventsFromB = [
        { type: "text-delta", text: "Hi" },
        { type: "tool-call", toolCallId: "b1", toolName: "read", input: { path: "/test" } },
      ]

      // Extract tool calls
      const ensembleEvents = [
        ...eventsFromA.map(e => ({ source: "modelA" as const, event: e })),
        ...eventsFromB.map(e => ({ source: "modelB" as const, event: e })),
      ]

      const { callsA, callsB } = extractToolCalls(ensembleEvents as any)

      // Both models called read with same input
      expect(callsA).toHaveLength(1)
      expect(callsB).toHaveLength(1)

      // Merge should show high confidence agreement
      const merged = await Effect.runPromise(mergeToolCalls(callsA as any, callsB as any))
      expect(merged.merged[0].confidence).toBe("high")
    })
  })
})
