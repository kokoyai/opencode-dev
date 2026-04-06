# 🎯 Ensemble 系统使用指南

## 📋 快速开始

### 1. 查看当前配置

```bash
# 查看 ensemble 配置
cat src/ensemble/config.ts
```

当前配置：

- **启用状态**: ✅ `enabled: true`
- **并行模型**: `glm-5` + `kimi-k2.5`
- **Judge 模型**: `kimi-k2.5`

---

### 2. 启用/禁用 Ensemble

修改 `src/ensemble/config.ts`：

```typescript
export function getEnsembleConfig(): EnsembleConfig {
  return {
    enabled: false, // 👈 改为 false 禁用
    models: ["glm-5", "kimi-k2.5"],
    judgeModel: "kimi-k2.5",
  }
}
```

---

### 3. 自定义模型配置

```typescript
export function getEnsembleConfig(): EnsembleConfig {
  return {
    enabled: true,
    // 使用不同的模型组合
    models: ["claude-3-opus", "gpt-4-turbo"],
    judgeModel: "gpt-4-turbo",
  }
}
```

---

## 🔧 集成到现有系统

### 方式 1：在 Session 中使用（推荐）

在 `src/session/prompt.ts` 的 `runLoop()` 函数中：

```typescript
import { EnsembleProcessor } from "@/ensemble"
import { getEnsembleConfig } from "@/ensemble/config"

export async function runLoop(ctx: RunLoopContext) {
  const ensembleConfig = getEnsembleConfig()

  // 原来的代码
  // const result = await handle.process(streamInput)

  // 新代码：使用 ensemble
  if (ensembleConfig.enabled) {
    const processor = yield * EnsembleProcessor.Service
    const ensembleResult = yield * processor.process(streamInput)

    // 将 ensemble 结果转换为 session 格式
    // TODO: 实现转换逻辑
  } else {
    // 原来的单模型处理
    const result = yield * handle.process(streamInput)
  }
}
```

---

### 方式 2：独立使用

```typescript
import { Effect } from "effect"
import { EnsembleProcessor } from "@/ensemble"

const program = Effect.gen(function* () {
  const processor = yield* EnsembleProcessor.Service

  const result = yield* processor.process({
    user: userMessage,
    sessionID: "test-session",
    model: modelConfig,
    agent: agentInfo,
    system: ["You are helpful"],
    messages: [],
    tools: {},
  })

  console.log(result.text) // 最终输出
  console.log(result.confidence) // 置信度
  console.log(result.metadata) // 元数据
})

// 运行
await Effect.runPromise(program.pipe(Effect.provide(EnsembleProcessor.defaultLayer)))
```

---

## 📊 输出结构

```typescript
interface EnsembleResult {
  text: string // 最终文本输出
  toolCalls: Array<{
    // 工具调用列表
    toolName: string
    input: unknown
    toolCallId: string
  }>
  reasoning?: string // 推理过程（可选）
  confidence: "high" | "medium" | "low" // 置信度
  metadata: {
    modelAContributed: boolean // Model A 是否贡献
    modelBContributed: boolean // Model B 是否贡献
    conflictsResolved: number // 解决的冲突数
    judgeUsed: boolean // 是否使用了 Judge
  }
}
```

---

## 🚀 当前状态

### ✅ 已实现（MVP）

- 配置系统
- 类型定义
- Effect 服务架构
- 基础测试
- **单模型处理**（占位实现）

### 🔄 待实现（完整版）

- 真正的并行双模型调用
- Judge 综合决策逻辑
- 工具调用冲突解决
- Session Flow 完整集成

---

## 📝 使用建议

### 开发阶段

1. **禁用 ensemble**：`enabled: false`
2. 使用单模型开发和测试

### 生产环境

1. **启用 ensemble**：`enabled: true`
2. 选择性能/质量平衡的模型组合
3. 监控 `confidence` 和 `metadata` 指标

### 调优建议

- 高延迟场景：禁用 ensemble（减少 Judge 开销）
- 高质量需求：启用 ensemble（多模型交叉验证）
- 工具密集型：需要完善工具冲突解决逻辑

---

## 🔍 故障排查

### 问题：类型错误

**解决**：确保 Effect 版本一致，运行 `bun typecheck`

### 问题：模型不存在

**解决**：检查 `models[]` 配置，确保 provider 已配置

### 问题：性能慢

**原因**：双模型 + Judge 增加延迟
**解决**：禁用 ensemble 或选择更快模型

---

## 📚 相关文件

```
src/ensemble/
├── config.ts          # 配置文件 ⭐
├── processor.ts       # 主处理器
├── stream.ts          # 并行流
├── tool-merger.ts     # 工具合并
├── judge.ts           # Judge 决策
└── types.ts           # 类型定义

examples/
└── ensemble-demo.ts   # 使用示例
```

---

## 💡 下一步

1. **测试运行**：

   ```bash
   bun test src/ensemble/__tests__/
   ```

2. **查看日志**：

   ```typescript
   // 在代码中添加
   console.log("Ensemble result:", result)
   ```

3. **自定义配置**：
   编辑 `src/ensemble/config.ts`

4. **完整集成**：
   修改 `src/session/prompt.ts` 的 `runLoop()`

---

**提示**：当前是 MVP 版本，仅实现单模型处理。完整的并行双模型 + Judge 决策功能待后续实现。
