import { Effect, Layer, ServiceMap } from "effect"
import * as Stream from "effect/Stream"
import { LLM } from "@/session/llm"
import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { getEnsembleConfigEffect } from "./config"
import type { EnsembleResult, JudgeInput } from "./types"
import { judgeSynthesis } from "./judge"
import { mergeToolCalls, extractToolCalls, collectBothModels } from "./stream"
import { ModelID, ProviderID } from "@/provider/schema"
import { Config } from "@/config/config"

const log = Log.create({ service: "ensemble.processor" })

export interface Interface {
  readonly process: (input: LLM.StreamInput) => Effect.Effect<EnsembleResult, never, LLM.Service | Provider.Service | Config.Service>
  readonly stream: (input: LLM.StreamInput) => Stream.Stream<never, never, LLM.Service | Provider.Service | Config.Service>
}

export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/EnsembleProcessor") {}

export const layer: Layer.Layer<Service, never, LLM.Service | Provider.Service | Config.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      /**
       * Process with ensemble - returns final result after both models complete
       */
      process(input: LLM.StreamInput) {
        return Effect.gen(function* () {
          const config = yield* getEnsembleConfigEffect()

          log.info("Ensemble processing started", {
            enabled: config.enabled,
            models: config.models,
          })

          if (!config.enabled) {
            // Disabled: return single model result
            return yield* processSingleModel(input)
          }

          // Run both models in parallel
          log.info("Running dual model parallel execution")

          const { outputA, outputB } = yield* collectBothModels(input, config)

          // Extract and merge tool calls
          const toolCallsEvents = [
            ...outputA.toolCalls.map((tc) => ({
              source: "modelA" as const,
              event: {
                type: "tool-call" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              } as any,
            })),
            ...outputB.toolCalls.map((tc) => ({
              source: "modelB" as const,
              event: {
                type: "tool-call" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              } as any,
            })),
          ]

          const { callsA, callsB } = extractToolCalls(toolCallsEvents)
          const mergedTools = yield* mergeToolCalls(callsA, callsB)

          log.info("Tool calls merged", {
            mergedCount: mergedTools.merged.length,
            conflictCount: mergedTools.conflicts.length,
          })

          // Build judge input
          const judgeInput: JudgeInput = {
            outputA,
            outputB,
            mergedTools,
            originalPrompt: extractPromptFromInput(input),
          }

          // Call judge for synthesis
          log.info("Calling judge for synthesis")
          const decision = yield* judgeSynthesis(judgeInput)

          log.info("Judge decision received", {
            confidence: decision.confidence,
            finalTextLength: decision.finalText.length,
          })

          // Build final result
          const result: EnsembleResult = {
            text: decision.finalText,
            toolCalls: decision.selectedTools.map((t) => ({
              toolName: t.toolName,
              input: t.input,
              toolCallId: t.toolCallId,
            })),
            reasoning: decision.reasoning,
            confidence: decision.confidence,
            metadata: {
              modelAContributed: outputA.text.length > 0 || outputA.toolCalls.length > 0,
              modelBContributed: outputB.text.length > 0 || outputB.toolCalls.length > 0,
              conflictsResolved: decision.conflictResolutions.length,
              judgeUsed: true,
            },
          }

          return result
        }).pipe(Effect.orDie)
      },

      /**
       * Stream with ensemble - returns interleaved events from both models
       * This is useful for real-time UI updates
       */
      stream(input: LLM.StreamInput) {
        return Stream.unwrap(
          Effect.gen(function* () {
            const config = yield* getEnsembleConfigEffect()

            if (!config.enabled) {
              // Disabled: use single model stream
              const llm = yield* LLM.Service
              return llm.stream(input)
            }

            // For now, stream from model A only
            // TODO: Implement proper dual-stream with event aggregation
            const llm = yield* LLM.Service
            return llm.stream(input)
          }),
        )
      },
    })
  }),
)

// Single model processing fallback
function processSingleModel(input: LLM.StreamInput): Effect.Effect<EnsembleResult, never, LLM.Service> {
  return Effect.gen(function* () {
    const llm = yield* LLM.Service
    const stream = llm.stream(input)

    let text = ""
    const toolCalls: EnsembleResult["toolCalls"] = []
    let reasoning = ""

    yield* Stream.runForEach(stream, (event) => {
      if (event.type === "text-delta") {
        text += event.text
      } else if (event.type === "reasoning-delta") {
        reasoning += event.text
      } else if (event.type === "tool-call") {
        toolCalls.push({
          toolName: event.toolName,
          input: event.input,
          toolCallId: event.toolCallId,
        })
      }
      return Effect.void
    }).pipe(Effect.orDie)

    const result: EnsembleResult = {
      text,
      toolCalls,
      reasoning: reasoning.length > 0 ? reasoning : undefined,
      confidence: "medium",
      metadata: {
        modelAContributed: true,
        modelBContributed: false,
        conflictsResolved: 0,
        judgeUsed: false,
      },
    }

    return result
  })
}

// Extract prompt from input
function extractPromptFromInput(input: LLM.StreamInput): string {
  try {
    const messages = input.messages
    if (messages && messages.length > 0) {
      const lastUserMessage = messages.filter((m) => m.role === "user").pop()
      if (lastUserMessage && typeof lastUserMessage.content === "string") {
        return lastUserMessage.content
      }
    }
  } catch (error) {
    log.warn("Failed to extract prompt from input", { error: String(error) })
  }
  return ""
}

export const defaultLayer = layer
