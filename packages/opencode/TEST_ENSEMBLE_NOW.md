# Ensemble 测试状态

## ✅ 已完成的工作

1. **Ensemble 核心实现** - 完整
   - 双模型并行处理
   - 工具合并器
   - Judge 决策
   - 配置系统

2. **集成到 SessionProcessor** - 完成
   - 添加了 EnsembleProcessor.Service 依赖
   - 修改了 tryProcess 使用 Ensemble
   - 提供了正确的 Layer 依赖

3. **编译** - 成功
   - 类型检查通过（仅测试文件有错误）
   - 二进制文件已生成

4. **配置** - 启用
   - `enabled: true`
   - `models: ["glm-5", "kimi-k2.5"]`
   - `judgeModel: "kimi-k2.5"`

## 🧪 如何测试

**启动开发服务器**：
```bash
cd /vol2/1000/001-mwcode
opencode
# 或者
bun run dev
```

**然后提问**：
```
用 TypeScript 写一个单例模式
```

**观察日志**：
- 如果看到 "Using Ensemble dual-model processing" → 双模型启用成功
- 如果看到模型调用日志 → 真实 API 调用

## ⚠️  编译后二进制的问题

编译后的二进制文件有 agent 配置问题：
- 显示找不到 "superpower" agent
- 可能需要更新配置文件

**建议**：使用开发服务器测试，不要用编译后的二进制
