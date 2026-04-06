import { Log } from "../util/log"
import type { ProviderID } from "./schema"

/**
 * 模型限制双轨机制
 *
 * 静态默认值：来自models.dev或配置文件
 * 运行时观察值：从实际API错误中学习
 *
 * 在遇到上下文溢出错误时，记录实际观察到的限制，
 * 以便下次更准确地预测何时需要压缩。
 */

export namespace LimitTracker {
  const log = Log.create({ service: "provider.limit-tracker" })

  // 存储观察到的模型限制
  // key: providerID
  const observedLimits = new Map<string, ObservedLimit>()

  interface ObservedLimit {
    /** 观察到的最大上下文限制 */
    contextLimit: number
    /** 观察时间 */
    observedAt: number
    /** 观察来源 */
    source: "error_message" | "usage_response"
    /** 置信度 (0-1) */
    confidence: number
  }

  /**
   * 从错误消息中提取并记录观察到的限制
   */
  export function recordFromError(
    providerID: ProviderID,
    errorMessage: string,
  ): void {
    const extracted = extractLimitFromMessage(errorMessage)
    if (!extracted) return

    const key = String(providerID)
    const existing = observedLimits.get(key)

    // 只在新的观察值更可信时更新
    if (!existing || extracted.confidence > existing.confidence) {
      observedLimits.set(key, extracted)
      log.info("observed provider limit from error", {
        providerID,
        contextLimit: extracted.contextLimit,
        source: extracted.source,
        confidence: extracted.confidence,
      })
    }
  }

  /**
   * 从API响应中记录观察到的限制
   */
  export function recordFromResponse(
    providerID: ProviderID,
    usage: { input: number; output: number; total: number },
  ): void {
    const key = String(providerID)
    const existing = observedLimits.get(key)

    // 如果已观察到的限制大于当前使用量，说明至少有这个容量
    if (existing && existing.contextLimit > usage.total) {
      return
    }

    // 从使用量推断限制（假设使用了大部分容量）
    // 这不是特别准确，所以置信度较低
    const estimated = Math.ceil(usage.total * 1.1) // 10%缓冲
    observedLimits.set(key, {
      contextLimit: estimated,
      observedAt: Date.now(),
      source: "usage_response",
      confidence: 0.5,
    })

    log.debug("estimated provider limit from usage", {
      providerID,
      estimatedLimit: estimated,
      usage,
    })
  }

  /**
   * 获取provider的观察限制
   */
  export function getObservedLimit(providerID: ProviderID): number | undefined {
    const key = String(providerID)
    const observed = observedLimits.get(key)

    if (!observed) return undefined

    // 观察值在7天内有效
    const maxAge = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - observed.observedAt > maxAge) {
      observedLimits.delete(key)
      return undefined
    }

    return observed.contextLimit
  }

  /**
   * 获取有效的上下文限制（双轨取较小值）
   *
   * 静态值：保守，可能不准确
   * 观察值：来自实际错误，更准确
   *
   * 使用策略：
   * - 如果观察值置信度高，使用观察值
   * - 如果观察值置信度低，取静态值和观察值的较小值
   */
  export function getEffectiveLimit(
    providerID: ProviderID,
    staticLimit: number,
  ): number {
    const key = String(providerID)
    const observed = observedLimits.get(key)

    if (!observed) return staticLimit
    if (staticLimit === 0) return observed.contextLimit

    // 高置信度：信任观察值
    if (observed.confidence >= 0.8) {
      return Math.min(staticLimit, observed.contextLimit)
    }

    // 中等置信度：取较小值并留缓冲
    if (observed.confidence >= 0.5) {
      return Math.min(staticLimit * 0.95, observed.contextLimit)
    }

    // 低置信度：保守使用静态值
    return staticLimit
  }

  /**
   * 从错误消息中提取限制值
   */
  function extractLimitFromMessage(message: string): ObservedLimit | undefined {
    // 常见模式匹配
    const patterns = [
      // OpenAI style: "maximum context length is 128000 tokens"
      /maximum context length is (\d+)/i,
      // "input token limit is 229376"
      /input token limit is (\d+)/i,
      // "input characters limit is 819200"
      /input characters limit is (\d+)/i,
      // "context length exceeded: 150000 > 128000"
      /context length exceeded: \d+ > (\d+)/i,
      // Anthropic style: "prompt is too long: 150000 tokens > 100000 maximum"
      /prompt is too long: \d+ tokens? > (\d+)/i,
      // Chinese: "超过最大token限制 128000"
      /超过最大token限制[：:\s]*(\d+)/,
      // "exceeded 128000 tokens"
      /exceeded (\d+) tokens/i,
    ]

    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) {
        const limit = parseInt(match[1], 10)
        if (limit > 0) {
          return {
            contextLimit: limit,
            observedAt: Date.now(),
            source: "error_message" as const,
            confidence: 0.9, // 从错误消息提取的置信度较高
          }
        }
      }
    }

    return undefined
  }

  /**
   * 清除所有观察值
   */
  export function clear(): void {
    observedLimits.clear()
  }

  /**
   * 获取所有观察值（用于调试）
   */
  export function getAll(): Map<string, ObservedLimit> {
    return new Map(observedLimits)
  }
}
