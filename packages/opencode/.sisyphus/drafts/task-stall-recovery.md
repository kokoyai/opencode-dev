# Draft: 子代理任务停滞自动恢复 & 完成验证

## 需求（已确认）

- 子代理执行任务时经常"不工作了"，停下来等用户输入，导致任务中断
- 子代理报告"完成了"，但实际上没真正解决问题
- 需要在 opencode 引擎层面强制解决这两个问题（不是改 skill/prompt）

## 问题分析

### 问题 1: 任务停滞 / 等待用户输入

**根因**: 子代理使用 `question` 工具向用户提问时，会通过 `Deferred.await` 阻塞等待用户回复。
在子代理场景下，"用户"是父代理，而父代理正在等待子代理完成——形成死锁。

**现有机制**:

- `question` 工具的权限在 `general` agent 中是 `deny` 的（`question: "deny"`）
- 但 `explore` agent 没有明确禁止 question
- 子代理调用 question 工具时，如果权限拒绝，会触发 `Permission.RejectedError`，然后 `ctx.blocked = ctx.shouldBreak` 导致整个任务停止

**关键代码位置**:

- `src/session/processor.ts:242` - 权限拒绝导致 blocked
- `src/question/index.ts:150` - Deferred.await 阻塞
- `src/agent/agent.ts:152-157` - general agent 禁止了 question，但子代理仍然可以通过其他方式停滞

**另一种停滞**: 子代理调用 `text-end` 后 finish reason 是 `stop`（不是 `tool-calls`），这时 loop 认为任务完成，退出。但子代理可能只是"暂停"了，等着反馈。

### 问题 2: 提前报告完成

**根因**: `runLoop` 中判断退出条件是：

```
lastAssistant?.finish && !["tool-calls"].includes(lastAssistant.finish) && lastUser.id < lastAssistant.id
```

即只要模型发送了 finish=stop 且没有未完成的工具调用，就认为完成了。

**现有机制**:

- `force_continue`（config.experimental）: 检查 todo 列表，如果有未完成项就注入合成消息让模型继续。但这是配置项，默认关闭。
- `verify_completion`（config.experimental）: 已定义但未实现！
- `max_continue_attempts`: 默认 3 次，防止无限循环

## 技术决策

### 改为默认行为（非可选配置）

- `force_continue` 逻辑应该对子代理会话**默认启用**（不需要用户配置）
- 完成验证也应该默认启用

### 子代理的 question 工具权限

- 子代理会话中 question 工具应该被完全禁止，或者自动超时/自动应答

### 子代理停滞检测

- 当子代理在指定时间内没有产出（没有工具调用、没有文本输出），视为停滞
- 停滞时注入合成消息，提醒子代理继续工作

## 研究发现

### 关键文件和切入点

1. **`src/session/prompt.ts:1474-1535`** - `runLoop` 中现有的 `force_continue` 逻辑
   - 当前仅在 `cfg.experimental?.force_continue` 开启时生效
   - 需改为：子代理会话默认启用

2. **`src/session/prompt.ts:1396-1414`** - `prompt` 函数 → 调用 `loop`
   - 子代理的入口

3. **`src/tool/task.ts:130`** - `SessionPrompt.prompt()` 调用
   - task 工具执行子代理的入口

4. **`src/session/prompt.ts:105-117`** - `cache` / `continueAttempts`
   - 已有 continue attempts 的状态追踪

5. **`src/tool/task.ts:75-103`** - 子代理会话创建
   - 可以在这里添加默认权限（禁止 question）

6. **`src/session/index.ts:315-330`** - Session.Info 接口
   - session 有 `parentID` 字段，可以用来判断是否是子代理

7. **`src/agent/agent.ts:107-163`** - agent 定义
   - 各 agent 的权限配置

## 开放问题

- ✅ 不需要用户确认：直接强制实现（用户明确说"强制实现"）

## 范围边界

- 包含 (INCLUDE):
  - 子代理停滞自动恢复
  - 子代理完成验证
  - question 工具在子代理中的处理
  - force_continue 对子代理默认启用
- 排除 (EXCLUDE):
  - 主代理（primary agent）的行为不改
  - 不改 skill 或 prompt 模板
  - 不改 UI/TUI 层
