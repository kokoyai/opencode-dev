export namespace Token {
  const CHARS_PER_TOKEN = 4

  // ============================================================
  // 基础估算
  // ============================================================

  export function estimate(input: string) {
    return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
  }

  // ============================================================
  // 模型级膨胀系数
  // ============================================================

  /**
   * Tool call开销系数
   * - 工具名和参数会被序列化为JSON
   * - 响应结构也有固定开销
   */
  export const TOOL_CALL_OVERHEAD = {
    base: 10, // 每个tool call的基础开销（tool_use标签等）
    argsMultiplier: 1.15, // 参数JSON序列化膨胀
    resultMultiplier: 1.1, // 结果结构化开销
  }

  /**
   * Reasoning/Thinking开销
   * - thinking tokens通常不在最终输出中显示
   * - 但会计入上下文限制
   */
  export const REASONING_OVERHEAD = {
    multiplier: 1.0, // thinking tokens直接计入
    budgetUtilization: 0.9, // 通常使用budget的90%
  }

  /**
   * 系统提示固定开销
   * - 包含工具定义、指令、格式说明等
   */
  export const SYSTEM_PROMPT_OVERHEAD = {
    base: 1500, // 基础系统提示
    perTool: 50, // 每个工具定义的开销
    perFile: 30, // 每个文件路径引用
  }

  /**
   * 媒体文件token估算
   * - 图片：按分辨率估算
   * - PDF：按页数估算
   */
  export function estimateImageTokens(width: number, height: number): number {
    // OpenAI/Anthropic 图片token估算公式
    // 大约 (width * height) / 750 tiles, 每tile约85 tokens
    const tiles = Math.ceil(width / 512) * Math.ceil(height / 512)
    return tiles * 85 + 85 // base tokens + tile tokens
  }

  export function estimatePdfTokens(pages: number): number {
    // 每页约500-1000 tokens
    return pages * 750
  }

  // ============================================================
  // 高级估算函数
  // ============================================================

  /**
   * 估算tool call的完整开销
   */
  export function estimateToolCall(tool: {
    name: string
    args: Record<string, unknown>
    result?: unknown
    hasReasoning?: boolean
  }): number {
    let tokens = TOOL_CALL_OVERHEAD.base
    tokens += estimate(tool.name)
    tokens += estimate(JSON.stringify(tool.args)) * TOOL_CALL_OVERHEAD.argsMultiplier
    if (tool.result !== undefined) {
      const resultStr = typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result)
      tokens += estimate(resultStr) * TOOL_CALL_OVERHEAD.resultMultiplier
    }
    return Math.round(tokens)
  }

  /**
   * 估算reasoning/thinking tokens
   */
  export function estimateReasoning(text: string, budgetTokens?: number): number {
    const textTokens = estimate(text)
    if (budgetTokens && textTokens > budgetTokens) {
      return Math.round(budgetTokens * REASONING_OVERHEAD.budgetUtilization)
    }
    return textTokens
  }

  /**
   * 估算消息结构开销
   * - role标签、消息边界等
   */
  export function estimateMessageOverhead(parts: number): number {
    // 每条消息约20 tokens的结构开销
    // 每个part约5 tokens
    return 20 + parts * 5
  }

  /**
   * 根据模型上下文大小返回推荐的预检阈值
   */
  export function getRecommendedThreshold(contextLimit: number): {
    threshold: number
    reason: string
  } {
    if (contextLimit >= 200000) {
      return { threshold: 0.70, reason: "超大上下文(≥200K)，使用70%阈值" }
    }
    if (contextLimit >= 128000) {
      return { threshold: 0.65, reason: "大上下文(128K-200K)，使用65%阈值" }
    }
    if (contextLimit >= 32000) {
      return { threshold: 0.60, reason: "中等上下文(32K-128K)，使用60%阈值" }
    }
    if (contextLimit >= 16000) {
      return { threshold: 0.55, reason: "小上下文(16K-32K)，使用55%阈值" }
    }
    return { threshold: 0.50, reason: "极小上下文(<16K)，使用50%阈值" }
  }
}
