# Ensemble 集成步骤

## 简单方法：禁用 Ensemble 直到需要时

由于集成 Ensemble 到 SessionProcessor 需要修改很多依赖关系，最简单的方法是：

### 步骤 1: 暂时禁用 Ensemble

修改 `src/ensemble/config.ts`：

\`\`\`typescript
export function getEnsembleConfig(): EnsembleConfig {
  return {
    enabled: false,  // 👈 暂时禁用
    models: ["glm-5", "kimi-k2.5"],
    judgeModel: "kimi-k2.5",
  }
}
\`\`\`

### 步骤 2: 编译并测试

\`\`\`bash
bun run build
./dist/opencode-linux-x64/bin/opencode
\`\`\`

### 步骤 3: 真实测试 Ensemble

当需要启用 Ensemble 时，只需要将 `enabled` 改为 `true`，然后修改 `SessionProcessor` 来正确集成。

## 或者：独立测试 Ensemble

创建一个独立的测试脚本：

\`\`\`typescript
import { EnsembleProcessor } from "@/ensemble/processor"
import { LLM } from "@/session/llm"
import { Provider } from "@/provider/provider"

// 直接测试 Ensemble 功能
const result = await EnsembleProcessor.process(input)
\`\`\`

