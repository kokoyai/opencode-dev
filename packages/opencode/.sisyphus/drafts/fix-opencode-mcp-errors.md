# Draft: 修复 OpenCode MCP 错误

## 问题诊断（已完成）

### 已发现的错误

1. **证书验证错误**
   - 错误: `unknown certificate verification error`
   - 发生在后台任务中，持续 6分33秒

2. **MCP SSE 错误** (HTTP 405)
   - context7 SSE error: Non-200 status code (405)
   - grep_app SSE error: Non-200 status code (405)
   - websearch SSE error: Non-200 status code (405)

### 已确认的 MCP 服务

1. **websearch**
   - 文件: `/vol2/1000/001-mwcode/packages/opencode/src/tool/websearch.ts`
   - 端点: `https://mcp.exa.ai/mcp`
   - 使用 MCP over SSE 协议

2. **context7 和 grep_app**
   - 在 `/vol2/1000/001-mwcode/packages/opencode/src/acp/agent.ts` 中有引用
   - 具体实现位置尚未确定

### 用户的网络环境

- 没有设置代理环境变量
- NODE_TLS_REJECT_UNAUTHORIZED 未设置（正常）
- Node.js v22.22.0, Bun 1.3.11

## 用户选择的修复方案

用户选择: "先 3 再 2"

1. 先尝试配置 NODE_TLS_REJECT_UNAUTHORIZED=0（忽略证书验证）
2. 如果不行，再禁用有问题的 MCP 服务

## 下一步

需要继续诊断：

- 确定 context7 和 grep_app 的具体实现位置
- 测试证书验证修复方案
