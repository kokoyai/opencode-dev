import { Effect, Stream } from "effect"
import { LLM } from "@/session/llm"
import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import type { ModelOutput, JudgeInput, JudgeDecision } from "./types"
import type { MergeResult } from "./tool-merger"
import { getEnsembleConfig } from "./config"

const log = Log.create({ service: "ensemble.judge" })

const JUDGE_SYSTEM_PROMPT = `You are an expert judge evaluating two AI model outputs.

Your task:
1. Compare the outputs from Model A and Model B
2. Decide which is better OR create a fusion of both
3. Resolve any conflicts in tool calls
4. Provide clear reasoning

Output your decision in this format:
\`\`\`json
{
  "decision": "useA" | "useB" | "fusion",
  "text": "final output text (if fusion, merge the best parts)",
  "reasoning": "why this decision",
  "confidence": "high" | "medium" | "low",
  "toolCallResolutions": [
    {
      "toolName": "...",
      "resolution": "useA" | "useB" | "both",
      "reasoning": "..."
    }
  ]
}
\`\`\`

Guidelines:
- Prefer more accurate, complete, and helpful responses
- Fusion should combine strengths of both models
- For tool calls, prefer the one that better serves user intent
- Be critical and thorough in your evaluation`

/**
 * Run judge synthesis on two model outputs
 */
export function judgeSynthesis(input: JudgeInput): Effect.Effect<JudgeDecision, never, LLM.Service | Provider.Service> {
  return Effect.gen(function* () {
    const config = getEnsembleConfig()
    
    if (!config.enabled) {
      // Ensemble disabled: return model A
      return {
        finalText: input.outputA.text,
        selectedTools: input.mergedTools.merged,
        conflictResolutions: [],
        reasoning: "Ensemble disabled",
        confidence: "medium" as const,
      }
    }

    log.info("Judge evaluating outputs", {
      textLengthA: input.outputA.text.length,
      textLengthB: input.outputB.text.length,
      hasConflicts: input.mergedTools.conflicts.length > 0,
    })

    // 构建 Judge 的输入
    const judgePrompt = buildJudgePrompt(input)

    // 调用 Judge 模型
    const provider = yield* Provider.Service
    const llm = yield* LLM.Service
    
    // 解析 Judge 模型
    const judgeModel = yield* resolveJudgeModel(provider, config.judgeModel)

    log.info("Calling judge model", { model: judgeModel.id })

    // 创建 Judge 的 stream input
    const judgeInput: LLM.StreamInput = {
      user: {
        id: "judge-user",
        role: "user",
        parts: [{ type: "text", text: judgePrompt }],
      } as any,
      sessionID: "judge-session",
      model: judgeModel,
      agent: {
        name: "judge",
        mode: "primary",
        permission: [],
        options: {},
      } as any,
      system: [JUDGE_SYSTEM_PROMPT],
      messages: [],
      tools: {},
    }

    // 调用 Judge
    const stream = llm.stream(judgeInput)
    
    // 收集 Judge 的响应
    let judgeText = ""
    yield* Stream.runForEach(stream, (event) => {
      if (event.type === "text-delta") {
        judgeText += event.text
      }
      return Effect.void
    }).pipe(Effect.orDie)

    log.info("Judge response received", {
      responseLength: judgeText.length,
    })

    // 解析 Judge 的决策
    const decision = parseJudgeResponse(judgeText, input)

    log.info("Judge decision made", {
      decision: decision.reasoning.substring(0, 100),
      confidence: decision.confidence,
    })

    return decision
  }).pipe(Effect.orDie)
}

function buildJudgePrompt(input: JudgeInput): string {
  const parts = [
    "# Original User Request",
    input.originalPrompt || "(not available)",
    "",
    "# Model A Output",
    input.outputA.text || "(no output)",
    "",
    "# Model B Output",
    input.outputB.text || "(no output)",
  ]

  // 添加工具调用信息
  if (input.outputA.toolCalls.length > 0 || input.outputB.toolCalls.length > 0) {
    parts.push("", "# Tool Calls")
    
    if (input.outputA.toolCalls.length > 0) {
      parts.push("## Model A Tools:")
      input.outputA.toolCalls.forEach((tool, i) => {
        parts.push(`${i + 1}. ${tool.toolName}: ${JSON.stringify(tool.input)}`)
      })
    }

    if (input.outputB.toolCalls.length > 0) {
      parts.push("## Model B Tools:")
      input.outputB.toolCalls.forEach((tool, i) => {
        parts.push(`${i + 1}. ${tool.toolName}: ${JSON.stringify(tool.input)}`)
      })
    }
  }

  // 添加冲突信息
  if (input.mergedTools.conflicts.length > 0) {
    parts.push("", "# Tool Call Conflicts")
    input.mergedTools.conflicts.forEach((conflict, i) => {
      parts.push(`${i + 1}. Tool: ${conflict.toolName}`)
      conflict.calls.forEach(call => {
        parts.push(`   - ${call.source}: ${JSON.stringify(call.event.input)}`)
      })
    })
  }

  parts.push("", "# Your Evaluation", "Provide your decision in the JSON format specified above.")

  return parts.join("\n")
}

function parseJudgeResponse(response: string, input: JudgeInput): JudgeDecision {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      
      return {
        finalText: parsed.text || input.outputA.text,
        selectedTools: input.mergedTools.merged,
        conflictResolutions: (parsed.toolCallResolutions || []).map((r: any) => ({
          conflict: input.mergedTools.conflicts.find(c => c.toolName === r.toolName) || input.mergedTools.conflicts[0],
          resolution: r.resolution,
          reasoning: r.reasoning,
        })),
        reasoning: parsed.reasoning || "Judge provided reasoning",
        confidence: parsed.confidence || "medium",
      }
    }
  } catch (error) {
    log.warn("Failed to parse judge response as JSON", { error: String(error) })
  }

  // Fallback: 使用 Judge 的文本作为推理
  // 选择包含更多实质内容的输出
  const outputAScore = scoreOutput(input.outputA)
  const outputBScore = scoreOutput(input.outputB)
  
  const chosenOutput = outputAScore >= outputBScore ? input.outputA : input.outputB

  return {
    finalText: chosenOutput.text,
    selectedTools: input.mergedTools.merged,
    conflictResolutions: input.mergedTools.conflicts.map(conflict => ({
      conflict,
      resolution: outputAScore >= outputBScore ? "useA" : "useB",
      reasoning: "Fallback: chose output with higher estimated quality",
    })),
    reasoning: response.substring(0, 500),
    confidence: "medium",
  }
}

// 简单的质量评分启发式
function scoreOutput(output: ModelOutput): number {
  let score = 0
  
  // 文本长度（合理范围内）
  if (output.text.length > 50 && output.text.length < 5000) {
    score += Math.min(output.text.length / 100, 10)
  }
  
  // 有工具调用
  if (output.toolCalls.length > 0) {
    score += 5
  }
  
  // 有推理过程
  if (output.reasoning && output.reasoning.length > 20) {
    score += 3
  }
  
  return score
}

function resolveJudgeModel(
  provider: Provider.Interface,
  modelID: string,
): Effect.Effect<Provider.Model, Error, never> {
  return Effect.gen(function* () {
    if (modelID.includes("/")) {
      const parsed = Provider.parseModel(modelID)
      const p = yield* provider.getProvider(parsed.providerID)
      const model = p.models[parsed.modelID]
      if (!model) {
        return yield* Effect.fail(new Error(`Judge model not found: ${modelID}`))
      }
      return model
    }

    const providers = yield* provider.list()
    for (const p of Object.values(providers)) {
      const model = p.models[modelID]
      if (model) {
        return model
      }
    }

    return yield* Effect.fail(new Error(`Judge model not found: ${modelID}`))
  })
}
