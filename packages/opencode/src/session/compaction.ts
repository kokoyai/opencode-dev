import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Session } from "."
import { SessionID, MessageID, PartID } from "./schema"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"
import { MessageV2 } from "./message-v2"
import z from "zod"
import { Token } from "../util/token"
import { Log } from "../util/log"
import { SessionProcessor } from "./processor"
import * as EnsembleProcessor from "@/ensemble/processor"
import { fn } from "@/util/fn"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import { NotFoundError } from "@/storage/db"
import { ModelID, ProviderID } from "@/provider/schema"
import { Effect, Layer, ServiceMap } from "effect"
import { makeRuntime } from "@/effect/run-service"
import { InstanceState } from "@/effect/instance-state"
import { isOverflow as overflow } from "./overflow"

export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

  // ============================================================
  // 结构化事件定义
  // ============================================================

  export const Event = {
    /** 会话压缩完成事件 */
    Compacted: BusEvent.define(
      "session.compacted",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
    /** L1轻压缩事件 */
    L1Prune: BusEvent.define(
      "session.compaction.l1_prune",
      z.object({
        sessionID: SessionID.zod,
        tokensFreed: z.number(),
        partsPruned: z.number(),
      }),
    ),
    /** L2中压缩事件 */
    L2Summary: BusEvent.define(
      "session.compaction.l2_summary",
      z.object({
        sessionID: SessionID.zod,
        inputTokens: z.number(),
        outputTokens: z.number(),
        messagesBefore: z.number(),
        messagesAfter: z.number(),
      }),
    ),
    /** L3硬截断事件 */
    L3Truncate: BusEvent.define(
      "session.compaction.l3_truncate",
      z.object({
        sessionID: SessionID.zod,
        messagesBefore: z.number(),
        messagesAfter: z.number(),
        turnsKept: z.number(),
        statePreserved: z.boolean(),
      }),
    ),
    /** 压缩级别选择事件 */
    LevelSelected: BusEvent.define(
      "session.compaction.level_selected",
      z.object({
        sessionID: SessionID.zod,
        level: z.enum(["L1", "L2", "L3", "none"]),
        usageRatio: z.number(),
        estimatedTokens: z.number(),
        contextLimit: z.number(),
        reason: z.string(),
      }),
    ),
    /** 上下文溢出检测事件 */
    OverflowDetected: BusEvent.define(
      "session.compaction.overflow_detected",
      z.object({
        sessionID: SessionID.zod,
        estimatedTokens: z.number(),
        contextLimit: z.number(),
        threshold: z.number(),
      }),
    ),
  }

  // ============================================================
  // 三级压缩策略配置（默认值，可通过config覆盖）
  // ============================================================

  /**
   * L1 轻压缩默认配置：清理tool output
   */
  export const L1_LIGHT_DEFAULT = {
    threshold: 0.65,
    minTokens: 15_000,
    protectedTokens: 30_000,
    protectedTools: ["skill"],
  }

  /**
   * L2 中压缩默认配置：历史摘要
   */
  export const L2_MEDIUM_DEFAULT = {
    threshold: 0.75,
    maxInputRatio: 0.5,
  }

  /**
   * L3 硬截断默认配置：保留最近消息
   */
  export const L3_HARD_DEFAULT = {
    threshold: 0.85,
    keepRecentTurns: 3,
    keepFirstMessage: true,
  }

  // 用于兼容旧代码的导出
  export const L1_LIGHT = L1_LIGHT_DEFAULT
  export const L2_MEDIUM = L2_MEDIUM_DEFAULT
  export const L3_HARD = L3_HARD_DEFAULT

  export const PRUNE_MINIMUM = 20_000
  export const PRUNE_PROTECT = 40_000
  const PRUNE_PROTECTED_TOOLS = ["skill"]

  /**
   * 从配置获取压缩参数
   */
  export function getCompactionConfig(cfg: { compaction?: Config.Info["compaction"] }) {
    return {
      L1: {
        threshold: cfg.compaction?.thresholds?.L1 ?? L1_LIGHT_DEFAULT.threshold,
        minTokens: cfg.compaction?.L1?.minTokens ?? L1_LIGHT_DEFAULT.minTokens,
        protectedTokens: cfg.compaction?.L1?.protectedTokens ?? L1_LIGHT_DEFAULT.protectedTokens,
        protectedTools: L1_LIGHT_DEFAULT.protectedTools,
      },
      L2: {
        threshold: cfg.compaction?.thresholds?.L2 ?? L2_MEDIUM_DEFAULT.threshold,
        maxInputRatio: cfg.compaction?.L2?.maxInputRatio ?? L2_MEDIUM_DEFAULT.maxInputRatio,
      },
      L3: {
        threshold: cfg.compaction?.thresholds?.L3 ?? L3_HARD_DEFAULT.threshold,
        keepRecentTurns: cfg.compaction?.L3?.keepRecentTurns ?? L3_HARD_DEFAULT.keepRecentTurns,
        keepFirstMessage: cfg.compaction?.L3?.keepFirstMessage ?? L3_HARD_DEFAULT.keepFirstMessage,
      },
    }
  }

  /**
   * 压缩级别
   */
  export type CompactionLevel = "L1" | "L2" | "L3" | "none"

  /**
   * 会话状态块 - 截断时需要保留的关键信息
   */
  export interface SessionStateBlock {
    /** 当前目标/任务 */
    goal?: string
    /** 关键指令 */
    instructions: string[]
    /** 正在工作的文件 */
    workingFiles: string[]
    /** 已完成的工作 */
    accomplished: string[]
    /** 重要发现 */
    discoveries: string[]
    /** 提取时间戳 */
    extractedAt: number
  }

  /**
   * 从消息中提取会话状态
   */
  export function extractSessionState(messages: MessageV2.WithParts[]): SessionStateBlock {
    const state: SessionStateBlock = {
      instructions: [],
      workingFiles: [],
      accomplished: [],
      discoveries: [],
      extractedAt: Date.now(),
    }

    // 从后往前扫描，提取关键信息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]

      // 提取工作文件
      for (const part of msg.parts) {
        if (part.type === "file" && part.filename) {
          // 去重添加
          if (!state.workingFiles.includes(part.filename)) {
            state.workingFiles.push(part.filename)
          }
        }
        if (part.type === "tool") {
          // 从工具参数中提取文件路径
          const input =
            part.state.status === "pending" || part.state.status === "running" ? part.state.input : part.state.input
          if (input?.file_path && typeof input.file_path === "string") {
            if (!state.workingFiles.includes(input.file_path)) {
              state.workingFiles.push(input.file_path)
            }
          }
          if (input?.path && typeof input.path === "string") {
            if (!state.workingFiles.includes(input.path)) {
              state.workingFiles.push(input.path)
            }
          }
        }
      }

      // 从文本消息中提取目标和指令
      if (msg.info.role === "user") {
        for (const part of msg.parts) {
          if (part.type === "text" && !part.synthetic) {
            const text = part.text
            // 检测目标/任务描述
            if (!state.goal && text.length > 20) {
              // 第一条有实质内容的用户消息作为目标
              const firstUserMsg = messages.find((m) => m.info.role === "user")
              if (firstUserMsg === msg && text.length < 500) {
                state.goal = text.trim()
              }
            }
            // 检测重要指令（包含关键词）
            const instructionKeywords = [
              "不要",
              "必须",
              "注意",
              "确保",
              "important",
              "must",
              "don't",
              "do not",
              "make sure",
              "ensure",
            ]
            if (instructionKeywords.some((kw) => text.toLowerCase().includes(kw))) {
              if (text.length < 500 && !state.instructions.includes(text.trim())) {
                state.instructions.push(text.trim())
              }
            }
          }
        }
      }

      // 限制数量
      if (state.workingFiles.length > 20) break
      if (state.instructions.length > 10) break
    }

    // 限制文件数量，保留最近的
    state.workingFiles = state.workingFiles.slice(0, 20)
    // 限制指令数量，保留最近的
    state.instructions = state.instructions.slice(0, 10)

    return state
  }

  /**
   * 将会话状态转换为提示文本
   */
  export function sessionStateToPrompt(state: SessionStateBlock): string {
    const parts: string[] = []

    if (state.goal) {
      parts.push(`## Original Goal\n${state.goal}`)
    }

    if (state.instructions.length > 0) {
      parts.push(`## Important Instructions\n${state.instructions.map((i) => `- ${i}`).join("\n")}`)
    }

    if (state.workingFiles.length > 0) {
      parts.push(`## Working Files\n${state.workingFiles.map((f) => `- ${f}`).join("\n")}`)
    }

    if (parts.length === 0) {
      return ""
    }

    return `---
[Session State Preserved at ${new Date(state.extractedAt).toISOString()}]
${parts.join("\n\n")}
---`
  }

  /**
   * 根据token使用情况选择压缩级别
   */
  export function selectCompactionLevel(
    currentTokens: number,
    contextLimit: number,
    L1Threshold?: number,
    L2Threshold?: number,
    L3Threshold?: number,
  ): { level: CompactionLevel; reason: string } {
    const usageRatio = currentTokens / contextLimit
    const L1 = L1Threshold ?? L1_LIGHT_DEFAULT.threshold
    const L2 = L2Threshold ?? L2_MEDIUM_DEFAULT.threshold
    const L3 = L3Threshold ?? L3_HARD_DEFAULT.threshold

    if (usageRatio >= L3) {
      return {
        level: "L3",
        reason: `使用率 ${(usageRatio * 100).toFixed(1)}% >= ${(L3 * 100).toFixed(0)}%，需要硬截断`,
      }
    }
    if (usageRatio >= L2) {
      return {
        level: "L2",
        reason: `使用率 ${(usageRatio * 100).toFixed(1)}% >= ${(L2 * 100).toFixed(0)}%，需要历史摘要`,
      }
    }
    if (usageRatio >= L1) {
      return {
        level: "L1",
        reason: `使用率 ${(usageRatio * 100).toFixed(1)}% >= ${(L1 * 100).toFixed(0)}%，清理工具输出`,
      }
    }
    return { level: "none", reason: `使用率 ${(usageRatio * 100).toFixed(1)}%，无需压缩` }
  }

  export interface Interface {
    readonly isOverflow: (input: {
      tokens: MessageV2.Assistant["tokens"]
      model: Provider.Model
    }) => Effect.Effect<boolean>
    readonly prune: (input: { sessionID: SessionID }) => Effect.Effect<void>
    readonly process: (input: {
      parentID: MessageID
      messages: MessageV2.WithParts[]
      sessionID: SessionID
      auto: boolean
      overflow?: boolean
    }) => Effect.Effect<"continue" | "stop">
    readonly create: (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderID; modelID: ModelID }
      auto: boolean
      overflow?: boolean
    }) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/SessionCompaction") {}

  export const layer: Layer.Layer<
    Service,
    never,
    | Bus.Service
    | Config.Service
    | Session.Service
    | Agent.Service
    | Plugin.Service
    | SessionProcessor.Service
    | Provider.Service
  > = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const config = yield* Config.Service
      const session = yield* Session.Service
      const agents = yield* Agent.Service
      const plugin = yield* Plugin.Service
      const processors = yield* SessionProcessor.Service
      const provider = yield* Provider.Service

      const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input: {
        tokens: MessageV2.Assistant["tokens"]
        model: Provider.Model
      }) {
        return overflow({ cfg: yield* config.get(), tokens: input.tokens, model: input.model })
      })

      // ============================================================
      // L1 轻压缩：清理tool output
      // ============================================================
      const prune = Effect.fn("SessionCompaction.prune")(function* (input: { sessionID: SessionID }) {
        const cfg = yield* config.get()
        if (cfg.compaction?.prune === false) return
        log.info("L1 light compaction: pruning tool outputs")

        // 获取可配置的参数
        const compactionConfig = getCompactionConfig(cfg)
        const L1 = compactionConfig.L1

        const msgs = yield* session
          .messages({ sessionID: input.sessionID })
          .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
        if (!msgs) return

        let total = 0
        let pruned = 0
        const toPrune: MessageV2.ToolPart[] = []
        let turns = 0

        loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
          const msg = msgs[msgIndex]
          if (msg.info.role === "user") turns++
          if (turns < 2) continue
          if (msg.info.role === "assistant" && msg.info.summary) break loop
          for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
            const part = msg.parts[partIndex]
            if (part.type === "tool")
              if (part.state.status === "completed") {
                if (L1.protectedTools.includes(part.tool)) continue
                if (part.state.time.compacted) break loop
                // 使用增强的tool token估算
                const estimate = Token.estimateToolCall({
                  name: part.tool,
                  args: part.state.input,
                  result: part.state.output,
                })
                total += estimate
                if (total > L1.protectedTokens) {
                  pruned += estimate
                  toPrune.push(part)
                }
              }
          }
        }

        log.info("L1 compaction found candidates", { pruned, total, count: toPrune.length })
        if (pruned > L1.minTokens) {
          for (const part of toPrune) {
            if (part.state.status === "completed") {
              part.state.time.compacted = Date.now()
              yield* session.updatePart(part)
            }
          }
          log.info("L1 compaction completed", { count: toPrune.length, tokensFreed: pruned })
          // 发布结构化事件
          yield* bus.publish(Event.L1Prune, {
            sessionID: input.sessionID,
            tokensFreed: pruned,
            partsPruned: toPrune.length,
          })
        }
      })

      // ============================================================
      // L3 硬截断：保留最近消息
      // ============================================================
      const hardTruncate = (input: {
        messages: MessageV2.WithParts[]
        keepTurns: number
        keepFirstMessage: boolean
      }): MessageV2.WithParts[] => {
        const msgs = [...input.messages]
        const result: MessageV2.WithParts[] = []

        // 提取会话状态
        const state = extractSessionState(msgs)
        const statePrompt = sessionStateToPrompt(state)

        // 保留第一条用户消息
        const firstUser = msgs.find((m) => m.info.role === "user")
        if (firstUser && input.keepFirstMessage) {
          // 如果有状态信息，添加到第一条消息
          if (statePrompt) {
            const statePart: MessageV2.TextPart = {
              id: PartID.ascending(),
              sessionID: firstUser.info.sessionID,
              messageID: firstUser.info.id,
              type: "text",
              text: statePrompt,
              synthetic: true,
              time: { start: Date.now(), end: Date.now() },
            }
            // 克隆并添加状态部分
            const enhancedFirstUser = {
              ...firstUser,
              parts: [statePart, ...firstUser.parts],
            }
            result.push(enhancedFirstUser)
          } else {
            result.push(firstUser)
          }
        }

        // 从后往前数保留keepTurns轮对话
        let turns = 0
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i]
          if (msg.info.role === "user") {
            turns++
            if (turns > input.keepTurns) break
          }
          // 避免重复添加第一条消息
          if (input.keepFirstMessage && firstUser && msg.info.id === firstUser.info.id) continue
          result.unshift(msg)
        }

        log.info("L3 hard truncation completed", {
          original: msgs.length,
          remaining: result.length,
          keptTurns: Math.min(turns, input.keepTurns),
          statePreserved: !!statePrompt,
          workingFiles: state.workingFiles.length,
        })

        return result
      }

      // ============================================================
      // L2 中压缩：历史摘要
      // ============================================================
      const processCompaction = Effect.fn("SessionCompaction.process")(function* (input: {
        parentID: MessageID
        messages: MessageV2.WithParts[]
        sessionID: SessionID
        auto: boolean
        overflow?: boolean
      }) {
        const parent = input.messages.findLast((m) => m.info.id === input.parentID)
        if (!parent || parent.info.role !== "user") {
          throw new Error(`Compaction parent must be a user message: ${input.parentID}`)
        }
        const userMessage = parent.info

        let messages = input.messages
        let replay:
          | {
              info: MessageV2.User
              parts: MessageV2.Part[]
            }
          | undefined
        if (input.overflow) {
          const idx = input.messages.findIndex((m) => m.info.id === input.parentID)
          for (let i = idx - 1; i >= 0; i--) {
            const msg = input.messages[i]
            if (msg.info.role === "user" && !msg.parts.some((p) => p.type === "compaction")) {
              replay = { info: msg.info, parts: msg.parts }
              messages = input.messages.slice(0, i)
              break
            }
          }
          const hasContent =
            replay && messages.some((m) => m.info.role === "user" && !m.parts.some((p) => p.type === "compaction"))
          if (!hasContent) {
            replay = undefined
            messages = input.messages
          }
        }

        const agent = yield* agents.get("compaction")
        const model = agent.model
          ? yield* provider.getModel(agent.model.providerID, agent.model.modelID)
          : yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID)

        // ============================================================
        // 三级压缩策略选择
        // ============================================================
        const cfg = yield* config.get()
        const compactionConfig = getCompactionConfig(cfg)
        const contextLimit = model.limit.context

        // 估算当前消息的token数量
        let estimatedTokens = Token.SYSTEM_PROMPT_OVERHEAD.base
        for (const msg of messages) {
          estimatedTokens += Token.estimateMessageOverhead(msg.parts.length)
          for (const part of msg.parts) {
            if (part.type === "text") {
              estimatedTokens += Token.estimate(part.text)
            } else if (part.type === "tool") {
              estimatedTokens += Token.estimateToolCall({
                name: part.tool,
                args:
                  part.state.status === "pending" || part.state.status === "running"
                    ? part.state.input
                    : part.state.input,
                result: part.state.status === "completed" ? part.state.output : undefined,
              })
            } else if (part.type === "file") {
              if (part.source?.text) estimatedTokens += Token.estimate(part.source.text.value)
            } else if (part.type === "reasoning") {
              estimatedTokens += Token.estimateReasoning(part.text)
            }
          }
        }

        // 选择压缩级别（使用配置阈值）
        const levelInfo = selectCompactionLevel(
          estimatedTokens,
          contextLimit,
          compactionConfig.L1.threshold,
          compactionConfig.L2.threshold,
          compactionConfig.L3.threshold,
        )
        const usageRatio = estimatedTokens / contextLimit

        // 发布压缩级别选择事件
        yield* bus.publish(Event.LevelSelected, {
          sessionID: input.sessionID,
          level: levelInfo.level,
          usageRatio,
          estimatedTokens,
          contextLimit,
          reason: levelInfo.reason,
        })

        log.info("compaction level selected", {
          level: levelInfo.level,
          reason: levelInfo.reason,
          estimatedTokens,
          contextLimit,
          usageRatio: `${(usageRatio * 100).toFixed(1)}%`,
        })

        // 如果需要L3硬截断，先执行截断再继续L2摘要
        if (levelInfo.level === "L3") {
          log.warn("L3 hard truncation triggered - context critically overloaded")
          const messagesBefore = messages.length
          messages = hardTruncate({
            messages,
            keepTurns: compactionConfig.L3.keepRecentTurns,
            keepFirstMessage: compactionConfig.L3.keepFirstMessage,
          })
          // 发布L3截断事件
          yield* bus.publish(Event.L3Truncate, {
            sessionID: input.sessionID,
            messagesBefore,
            messagesAfter: messages.length,
            turnsKept: compactionConfig.L3.keepRecentTurns,
            statePreserved: compactionConfig.L3.keepFirstMessage,
          })
        }
        // Allow plugins to inject context or replace compaction prompt.
        const compacting = yield* plugin.trigger(
          "experimental.session.compacting",
          { sessionID: input.sessionID },
          { context: [], prompt: undefined },
        )
        const defaultPrompt = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so that another agent can read it and continue the work.
Do not call any tools. Respond only with the summary text.

When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---`

        const prompt = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
        const msgs = structuredClone(messages)

        // Pre-truncate if history is too large for compaction request
        const maxTokensForCompaction = Math.floor(contextLimit * L2_MEDIUM.maxInputRatio)

        // Recalculate tokens after potential L3 truncation
        let compactionTokens = Token.SYSTEM_PROMPT_OVERHEAD.base
        for (const msg of msgs) {
          compactionTokens += Token.estimateMessageOverhead(msg.parts.length)
          for (const part of msg.parts) {
            if (part.type === "text") {
              compactionTokens += Token.estimate(part.text)
            } else if (part.type === "tool") {
              compactionTokens += Token.estimateToolCall({
                name: part.tool,
                args:
                  part.state.status === "pending" || part.state.status === "running"
                    ? part.state.input
                    : part.state.input,
                result: part.state.status === "completed" ? part.state.output : undefined,
              })
            } else if (part.type === "file") {
              if (part.source?.text) compactionTokens += Token.estimate(part.source.text.value)
            } else if (part.type === "reasoning") {
              compactionTokens += Token.estimateReasoning(part.text)
            }
          }
        }

        // If still too large, truncate from the beginning, keeping recent messages
        if (compactionTokens > maxTokensForCompaction) {
          log.info("L2 compaction pre-truncation", {
            compactionTokens,
            maxTokensForCompaction,
            originalCount: msgs.length,
          })

          // Keep removing oldest messages until under limit
          while (msgs.length > 2 && compactionTokens > maxTokensForCompaction) {
            const removed = msgs.shift()
            if (removed) {
              compactionTokens -= Token.estimateMessageOverhead(removed.parts.length)
              for (const part of removed.parts) {
                if (part.type === "text") {
                  compactionTokens -= Token.estimate(part.text)
                } else if (part.type === "tool" && part.state.status === "completed") {
                  compactionTokens -= Token.estimateToolCall({
                    name: part.tool,
                    args: part.state.input,
                    result: part.state.output,
                  })
                }
              }
            }
          }

          log.info("L2 compaction post-truncation", {
            compactionTokens,
            remainingCount: msgs.length,
          })
        }

        yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })
        const modelMessages = yield* Effect.promise(() => MessageV2.toModelMessages(msgs, model, { stripMedia: true }))
        const ctx = yield* InstanceState.context
        const msg: MessageV2.Assistant = {
          id: MessageID.ascending(),
          role: "assistant",
          parentID: input.parentID,
          sessionID: input.sessionID,
          mode: "compaction",
          agent: "compaction",
          variant: userMessage.variant,
          summary: true,
          path: {
            cwd: ctx.directory,
            root: ctx.worktree,
          },
          cost: 0,
          tokens: {
            output: 0,
            input: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
        }
        yield* session.updateMessage(msg)
        const processor = yield* processors.create({
          assistantMessage: msg,
          sessionID: input.sessionID,
          model,
        })
        const result = yield* processor
          .process({
            user: userMessage,
            agent,
            sessionID: input.sessionID,
            tools: {},
            system: [],
            messages: [
              ...modelMessages,
              {
                role: "user",
                content: [{ type: "text", text: prompt }],
              },
            ],
            model,
          })
          .pipe(Effect.onInterrupt(() => processor.abort()))

        if (result === "compact") {
          // Even compaction request overflowed - try emergency truncation
          log.warn("compaction overflow - attempting emergency truncation")

          // Create a simple continuation message instead of failing
          const errorMessage = input.overflow
            ? "Conversation history too large to compact - exceeds model context limit"
            : "Session too large to compact - context exceeds model limit even after stripping media"
          processor.message.error = new MessageV2.ContextOverflowError({
            message: errorMessage,
          }).toObject()
          processor.message.finish = "error"
          yield* session.updateMessage(processor.message)

          // Create a user message explaining what happened
          if (input.auto) {
            const continueMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text: "The conversation history was too large and has been truncated. The previous context has been summarized or removed to allow continuation. Please continue with your work, or start a new session if important context was lost.",
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            })
            return "continue"
          }
          return "stop"
        }

        if (result === "continue" && input.auto) {
          if (replay) {
            const original = replay.info
            const replayMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: original.agent,
              model: original.model,
              format: original.format,
              tools: original.tools,
              system: original.system,
              variant: original.variant,
            })
            for (const part of replay.parts) {
              if (part.type === "compaction") continue
              const replayPart =
                part.type === "file" && MessageV2.isMedia(part.mime)
                  ? { type: "text" as const, text: `[Attached ${part.mime}: ${part.filename ?? "file"}]` }
                  : part
              yield* session.updatePart({
                ...replayPart,
                id: PartID.ascending(),
                messageID: replayMsg.id,
                sessionID: input.sessionID,
              })
            }
          }

          if (!replay) {
            const continueMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            const text =
              (input.overflow
                ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n"
                : "") +
              "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text,
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            })
          }
        }

        if (processor.message.error) return "stop"
        if (result === "continue") yield* bus.publish(Event.Compacted, { sessionID: input.sessionID })
        return result
      })

      const create = Effect.fn("SessionCompaction.create")(function* (input: {
        sessionID: SessionID
        agent: string
        model: { providerID: ProviderID; modelID: ModelID }
        auto: boolean
        overflow?: boolean
      }) {
        const msg = yield* session.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          model: input.model,
          sessionID: input.sessionID,
          agent: input.agent,
          time: { created: Date.now() },
        })
        yield* session.updatePart({
          id: PartID.ascending(),
          messageID: msg.id,
          sessionID: msg.sessionID,
          type: "compaction",
          auto: input.auto,
          overflow: input.overflow,
        })
      })

      return Service.of({
        isOverflow,
        prune,
        process: processCompaction,
        create,
      })
    }),
  )

  export const defaultLayer = Layer.unwrap(
    Effect.sync(() =>
      layer.pipe(
        Layer.provide(Provider.defaultLayer),
        Layer.provide(EnsembleProcessor.defaultLayer),
        Layer.provide(Session.defaultLayer),
        Layer.provide(SessionProcessor.defaultLayer),
        Layer.provide(Agent.defaultLayer),
        Layer.provide(Plugin.defaultLayer),
        Layer.provide(Bus.layer),
        Layer.provide(Config.defaultLayer),
      ),
    ),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    return runPromise((svc) => svc.isOverflow(input))
  }

  export async function prune(input: { sessionID: SessionID }) {
    return runPromise((svc) => svc.prune(input))
  }

  export const process = fn(
    z.object({
      parentID: MessageID.zod,
      messages: z.custom<MessageV2.WithParts[]>(),
      sessionID: SessionID.zod,
      auto: z.boolean(),
      overflow: z.boolean().optional(),
    }),
    (input) => runPromise((svc) => svc.process(input)),
  )

  export const create = fn(
    z.object({
      sessionID: SessionID.zod,
      agent: z.string(),
      model: z.object({ providerID: ProviderID.zod, modelID: ModelID.zod }),
      auto: z.boolean(),
      overflow: z.boolean().optional(),
    }),
    (input) => runPromise((svc) => svc.create(input)),
  )
}
