import { describe, it, expect } from "bun:test"
import { mergeToolCalls, extractToolCalls } from "../tool-merger"
import { Effect } from "effect"

describe("Tool Merger", () => {
  it("should extract tool calls from events", () => {
    const events = [
      {
        source: "modelA" as const,
        event: {
          type: "tool-call" as const,
          toolCallId: "call-1",
          toolName: "test-tool",
          input: { arg: "value" },
        },
      },
      {
        source: "modelB" as const,
        event: {
          type: "text-delta" as const,
          text: "some text",
        },
      },
    ]

    const { callsA, callsB } = extractToolCalls(events as any)

    expect(callsA).toHaveLength(1)
    expect(callsA[0].toolName).toBe("test-tool")
    expect(callsB).toHaveLength(0)
  })

  it("should merge tool calls", async () => {
    const result = await Effect.runPromise(
      mergeToolCalls(
        [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "test-tool",
            input: { arg: "value" },
          } as any,
        ],
        [],
      ),
    )

    expect(result.merged).toHaveLength(1)
    expect(result.merged[0].toolName).toBe("test-tool")
    expect(result.strategy).toBe("auto-merge")
  })
})
