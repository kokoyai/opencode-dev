import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"
import { LimitTracker } from "@/provider/limit-tracker"

const COMPACTION_BUFFER = 20_000

export function isOverflow(input: { cfg: Config.Info; tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  if (input.cfg.compaction?.auto === false) return false

  // 使用双轨机制获取有效限制
  const effectiveContext = LimitTracker.getEffectiveLimit(
    input.model.providerID,
    input.model.limit.context,
  )

  if (effectiveContext === 0) return false

  const count =
    input.tokens.total || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

  const reserved =
    input.cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
  const usable = input.model.limit.input
    ? input.model.limit.input - reserved
    : effectiveContext - ProviderTransform.maxOutputTokens(input.model)
  return count >= usable
}

/**
 * 处理上下文溢出错误，记录观察到的限制
 */
export function handleOverflowError(
  providerID: string,
  errorMessage: string,
): void {
  LimitTracker.recordFromError(providerID as any, errorMessage)
}
