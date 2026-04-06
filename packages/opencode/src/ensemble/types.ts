import { LLM } from "@/session/llm"
import type { MergeResult, MergedToolCall, ToolCallConflict } from "./tool-merger"

export type EnsembleSource = "modelA" | "modelB"

export interface EnsembleEvent {
  source: EnsembleSource
  event: LLM.Event
}

export interface ModelOutput {
  text: string
  toolCalls: Array<{
    toolName: string
    input: unknown
    toolCallId?: string
  }>
  reasoning?: string
}

export interface JudgeInput {
  outputA: ModelOutput
  outputB: ModelOutput
  mergedTools: MergeResult
  originalPrompt: string
}

export interface JudgeDecision {
  finalText: string
  selectedTools: MergedToolCall[]
  conflictResolutions: Array<{
    conflict: ToolCallConflict
    resolution: "useA" | "useB" | "useBoth" | "skip"
    reasoning: string
  }>
  reasoning: string
  confidence: "high" | "medium" | "low"
}

export interface EnsembleResult {
  text: string
  toolCalls: Array<{
    toolName: string
    input: unknown
    toolCallId: string
  }>
  reasoning?: string
  confidence: "high" | "medium" | "low"
  metadata: {
    modelAContributed: boolean
    modelBContributed: boolean
    conflictsResolved: number
    judgeUsed: boolean
  }
}

export interface EnsembleConfig {
  enabled: boolean
  models: [string, string]
  judgeModel: string
}
