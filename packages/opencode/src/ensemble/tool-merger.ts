import { Effect } from "effect"
import { LLM } from "@/session/llm"
import { Log } from "@/util/log"

const log = Log.create({ service: "ensemble.tool-merger" })

export type ToolCallEvent = Extract<LLM.Event, { type: "tool-call" }>

export interface ToolCallWithSource {
  source: "modelA" | "modelB"
  event: ToolCallEvent
}

export interface ToolCallConflict {
  toolName: string
  calls: ToolCallWithSource[]
  reason: "different-input" | "different-tool"
}

export interface MergedToolCall {
  toolCallId: string
  toolName: string
  input: unknown
  sources: ("modelA" | "modelB")[]
  confidence: "high" | "medium" | "low"
}

export interface MergeResult {
  merged: MergedToolCall[]
  conflicts: ToolCallConflict[]
  strategy: "auto-merge" | "sequential" | "judge-required"
}

/**
 * 智能合并两个模型的工具调用
 */
export function mergeToolCalls(
  callsA: ToolCallEvent[],
  callsB: ToolCallEvent[],
): Effect.Effect<MergeResult> {
  return Effect.gen(function* () {
    log.info("Merging tool calls", {
      callsACount: callsA.length,
      callsBCount: callsB.length,
    })

    const merged: MergedToolCall[] = []
    const conflicts: ToolCallConflict[] = []

    // 按工具名称分组
    const callsByToolA = groupByTool(callsA)
    const callsByToolB = groupByTool(callsB)

    // 获取所有工具名称
    const allToolNames = new Set([
      ...Object.keys(callsByToolA),
      ...Object.keys(callsByToolB),
    ])

    // 处理每个工具
    for (const toolName of allToolNames) {
      const toolsA = callsByToolA[toolName] || []
      const toolsB = callsByToolB[toolName] || []

      const result = mergeToolCallsByName(toolName, toolsA, toolsB)
      
      if (result.type === "merged") {
        merged.push(...result.calls)
      } else {
        conflicts.push(result.conflict)
      }
    }

    // 确定策略
    const strategy = determineStrategy(merged, conflicts)

    log.info("Tool calls merged", {
      mergedCount: merged.length,
      conflictCount: conflicts.length,
      strategy,
    })

    return { merged, conflicts, strategy }
  })
}

// 按工具名称分组
function groupByTool(calls: ToolCallEvent[]): Record<string, ToolCallEvent[]> {
  const result: Record<string, ToolCallEvent[]> = {}
  for (const call of calls) {
    if (!result[call.toolName]) {
      result[call.toolName] = []
    }
    result[call.toolName].push(call)
  }
  return result
}

type MergeOutcome =
  | { type: "merged"; calls: MergedToolCall[] }
  | { type: "conflict"; conflict: ToolCallConflict }

// 合并相同工具的调用
function mergeToolCallsByName(
  toolName: string,
  callsA: ToolCallEvent[],
  callsB: ToolCallEvent[],
): MergeOutcome {
  // 情况 1: 两个模型都调用了这个工具
  if (callsA.length > 0 && callsB.length > 0) {
    // 检查输入是否相同
    if (callsA.length === 1 && callsB.length === 1) {
      const callA = callsA[0]
      const callB = callsB[0]

      if (inputsEqual(callA.input, callB.input)) {
        // 高置信度：两个模型一致
        return {
          type: "merged",
          calls: [{
            toolCallId: callA.toolCallId,
            toolName: callA.toolName,
            input: callA.input,
            sources: ["modelA", "modelB"],
            confidence: "high",
          }],
        }
      }
    }

    // 输入不同 → 冲突
    const conflictCalls: ToolCallWithSource[] = [
      ...callsA.map(c => ({ source: "modelA" as const, event: c })),
      ...callsB.map(c => ({ source: "modelB" as const, event: c })),
    ]

    return {
      type: "conflict",
      conflict: {
        toolName,
        calls: conflictCalls,
        reason: "different-input",
      },
    }
  }

  // 情况 2: 只有一个模型调用了这个工具
  const calls = callsA.length > 0 ? callsA : callsB
  const source = callsA.length > 0 ? "modelA" : "modelB"

  return {
    type: "merged",
    calls: calls.map(call => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
      sources: [source],
      confidence: "medium", // 中等置信度：只有一个模型
    })),
  }
}

// 比较两个输入是否相等
function inputsEqual(inputA: unknown, inputB: unknown): boolean {
  try {
    return JSON.stringify(inputA) === JSON.stringify(inputB)
  } catch {
    return false
  }
}

// 确定合并策略
function determineStrategy(
  merged: MergedToolCall[],
  conflicts: ToolCallConflict[],
): "auto-merge" | "sequential" | "judge-required" {
  // 没有冲突 → 自动合并
  if (conflicts.length === 0) {
    return "auto-merge"
  }

  // 有冲突 → 需要 Judge 决策
  return "judge-required"
}

/**
 * 从事件流中提取工具调用
 */
export function extractToolCalls(
  events: Array<{ source: "modelA" | "modelB"; event: LLM.Event }>,
): { callsA: ToolCallEvent[]; callsB: ToolCallEvent[] } {
  const callsA: ToolCallEvent[] = []
  const callsB: ToolCallEvent[] = []

  for (const { source, event } of events) {
    if (event.type === "tool-call") {
      if (source === "modelA") {
        callsA.push(event)
      } else {
        callsB.push(event)
      }
    }
  }

  return { callsA, callsB }
}

/**
 * 根据冲突解决策略更新工具调用列表
 */
export function resolveConflicts(
  merged: MergedToolCall[],
  conflicts: ToolCallConflict[],
  resolutions: Array<{
    conflict: ToolCallConflict
    resolution: "useA" | "useB" | "useBoth" | "skip"
    reasoning: string
  }>,
): MergedToolCall[] {
  const result = [...merged]

  for (const { conflict, resolution } of resolutions) {
    if (resolution === "useA") {
      const callA = conflict.calls.find(c => c.source === "modelA")
      if (callA) {
        result.push({
          toolCallId: callA.event.toolCallId,
          toolName: callA.event.toolName,
          input: callA.event.input,
          sources: ["modelA"],
          confidence: "medium",
        })
      }
    } else if (resolution === "useB") {
      const callB = conflict.calls.find(c => c.source === "modelB")
      if (callB) {
        result.push({
          toolCallId: callB.event.toolCallId,
          toolName: callB.event.toolName,
          input: callB.event.input,
          sources: ["modelB"],
          confidence: "medium",
        })
      }
    } else if (resolution === "useBoth") {
      // 使用两个模型的工具调用
      conflict.calls.forEach(call => {
        result.push({
          toolCallId: call.event.toolCallId,
          toolName: call.event.toolName,
          input: call.event.input,
          sources: [call.source],
          confidence: "low", // 低置信度：两个都执行
        })
      })
    }
    // "skip" → 不添加任何工具调用
  }

  return result
}
