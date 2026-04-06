# Draft: Dual-Model Ensemble (kimi-k2.5 + glm-5)

## Requirements (confirmed)

- 用户希望 opencode 默认同时调用 kimi-k2.5 和 glm-5 两个模型
- 两个模型同时响应同一个 prompt，然后合并/综合结果以提高回答质量
- 通过 baiduqianfancodingplan provider 提供服务
- **合并策略**: 裁判模型综合 — 用 kimi-k2.5 作为裁判，综合两个模型的回答
- **作用范围**: 仅在 baiduqianfancodingplan provider 下启用
- **工具调用**: 两个模型各自给出工具调用建议后，合并去重再执行
- **裁判模型**: 用 kimi-k2.5 充当裁判（两个模型中的一个）
- **UI 展示**: 先展示两个模型的原始回答，然后展示裁判综合结果

## Technical Decisions

- 合并策略: 裁判模型综合（kimi-k2.5 做裁判）
- 并行调用两个模型（kimi-k2.5 + glm-5）
- 仅 baiduqianfancodingplan provider 启用
- 工具调用: 合并两个模型的 tool calls 去重后执行
- UI: 展示原始回答 + 综合结果

## Research Findings

- baiduqianfancodingplan 已在 schema.ts 中注册为 ProviderID
- kimi-k2.5 和 glm-5 都在 models-snapshot.js 中有完整定义
- transform.ts 已有 kimi 和 glm 的 temperature/topP 专门配置
- 当前架构：每个 session prompt 使用单一模型 (Provider.Model)
- Session loop 位于 session/prompt.ts，核心调用在 LLM.stream()
- 模型选择流程：config.model → agent.model → lastModel → defaultModel
- LLM.stream() 在 session/llm.ts 中实现
- MessageV2 系统支持多 part 消息结构（text, tool, subtask 等）

## Scope Boundaries

- INCLUDE: 双模型并行调用机制 + 裁判综合逻辑 + 工具调用合并 + UI 展示
- EXCLUDE: 其他 provider 的多模型支持、模型数量扩展（仅限 2 个）

## Test Strategy Decision

- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (tests-after)
- **Agent-Executed QA**: ALWAYS
