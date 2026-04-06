# OpenCode 启动速度优化

## TL;DR

> **快速摘要**: 优化 OpenCode CLI 启动时间从 ~2s 降至 <500ms
>
> **交付物**:
>
> - global/index.ts 惰性初始化重构
> - provider/models.ts 延迟网络请求
> - AI SDK 和主题文件动态导入
> - 命令/工具惰性加载优化
>
> **预估工作量**: Medium
> **并行执行**: YES - 4 波次
> **关键路径**: Task 1 → Task 5 → Task 9 → 验证

---

## Context

### Original Request

用户报告 `myopencode` 启动太慢，实际运行 `bun dev`。实测启动时间约 2.13 秒。

### Interview Summary

**关键讨论**:

- 优化范围: 全选 4 个瓶颈
- 策略: 保守优化，从最安全的改动开始
- 验证: 启动时间测量 + 现有测试

**研究发现**:

- global/index.ts top-level await 阻塞所有模块加载
- models.ts 在模块作用域发起网络请求
- 20+ AI SDK 和 35+ 主题文件在启动时全部加载

### Metis Review

**识别的风险** (已处理):

- 需要确保 global 模块在所有使用场景下都能正确初始化
- 动态导入需要处理导入失败的情况
- 需要测试各种启动场景

---

## Work Objectives

### Core Objective

将 OpenCode CLI 启动时间从 ~2s 降至 <500ms，同时保持所有现有功能正常工作。

### Concrete Deliverables

- `src/global/index.ts` - 惰性初始化模式
- `src/provider/models.ts` - 延迟网络请求
- `src/provider/provider.ts` - 动态导入 AI SDK
- `src/cli/cmd/tui/context/theme.tsx` - 按需加载主题

### Definition of Done

- [ ] `bun run --conditions=browser ./src/index.ts --help` 启动时间 < 500ms
- [ ] 所有现有测试通过 (`bun test`)
- [ ] `bun dev` 正常启动 TUI
- [ ] `bun dev run "test"` 正常执行命令

### Must Have

- 启动时间显著降低（目标 < 500ms）
- 所有现有功能正常工作
- 测试全部通过

### Must NOT Have (Guardrails)

- 不破坏现有 API 兼容性
- 不引入新的 top-level await
- 不在模块作用域发起网络请求
- 不删除任何功能

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **Automated tests**: Tests-after（先实现后测试）
- **Framework**: bun test
- **Agent-Executed QA**: 每个任务都包含手动 QA 场景

### QA Policy

每个任务必须包含代理执行的 QA 场景，证据保存到 `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (开始 - global 惰性初始化，最高优先级):
├── Task 1: global/index.ts 惰性初始化 [deep]
└── Task 2: 启动时间基准测试 [quick]

Wave 2 (Wave 1 后 - models 延迟网络请求):
├── Task 3: models.ts 延迟 refresh 调用 [deep]
└── Task 4: 验证 models 功能正常 [quick]

Wave 3 (Wave 2 后 - 动态导入):
├── Task 5: provider.ts AI SDK 动态导入 [deep]
├── Task 6: theme.tsx 主题按需加载 [visual-engineering]
└── Task 7: 验证动态导入功能 [quick]

Wave 4 (Wave 3 后 - 命令/工具惰性加载):
├── Task 8: 命令惰性加载探索 [deep]
└── Task 9: 工具惰性加载优化 [unspecified-high]

Wave FINAL (所有任务后):
├── Task F1: 启动时间对比验证 [quick]
├── Task F2: 功能回归测试 [unspecified-high]
├── Task F3: 性能基准测试报告 [quick]
└── Task F4: 代码质量检查 [unspecified-high]
```

### Dependency Matrix

- **1**: - → 2, 3, 5
- **2**: 1 → F1, F3
- **3**: 1 → 4, 5
- **4**: 3 → F2
- **5**: 3 → 6, 7
- **6**: 5 → 7
- **7**: 5, 6 → F2
- **8**: 1 → 9
- **9**: 8 → F2

### Agent Dispatch Summary

- **Wave 1**: 2 - T1 → `deep`, T2 → `quick`
- **Wave 2**: 2 - T3 → `deep`, T4 → `quick`
- **Wave 3**: 3 - T5 → `deep`, T6 → `visual-engineering`, T7 → `quick`
- **Wave 4**: 2 - T8 → `deep`, T9 → `unspecified-high`
- **FINAL**: 4 - F1-F4 → `quick`/`unspecified-high`

---

## TODOs

- [x] 1. global/index.ts 惰性初始化

  **What to do**:
  - 将 top-level await 改为惰性初始化函数
  - 使用 Promise 缓存确保只初始化一次
  - 保持 Global.Path API 不变

  **Must NOT do**:
  - 不改变 Global.Path 的公开 API
  - 不移除缓存清理逻辑
  - 不引入新的 top-level await

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解模块加载机制和惰性初始化模式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (其他任务依赖此任务)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 2, 3, 5, 8
  - **Blocked By**: None

  **References**:
  - `src/global/index.ts:29-54` - 当前的 top-level await 实现
  - `src/project/bootstrap.ts:15-40` - InstanceBootstrap 初始化模式参考

  **Acceptance Criteria**:
  - [ ] 文件修改完成: src/global/index.ts
  - [ ] 无 top-level await
  - [ ] Global.Path API 保持兼容
  - [ ] `bun run --conditions=browser ./src/index.ts --help` 正常执行

  **QA Scenarios**:

  ```
  Scenario: 启动测试 - help 命令
    Tool: Bash
    Steps:
      1. time bun run --conditions=browser ./src/index.ts --help
      2. 检查输出包含 "show help"
    Expected Result: 命令成功执行，启动时间减少
    Evidence: .sisyphus/evidence/task-1-startup-help.txt

  Scenario: 缓存目录创建
    Tool: Bash
    Steps:
      1. rm -rf ~/.local/share/opencode/test-cache
      2. OPENCODE_TEST_HOME=/tmp/test bun run --conditions=browser ./src/index.ts --version
      3. 检查目录是否创建
    Expected Result: 目录正确创建
    Evidence: .sisyphus/evidence/task-1-cache-create.txt
  ```

  **Commit**: YES
  - Message: `perf(global): lazy initialization for faster startup`
  - Files: `src/global/index.ts`

- [x] 2. 启动时间基准测试

  **What to do**:
  - 测量优化后的启动时间
  - 对比优化前后的数据
  - 记录基准数据

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的测量任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1, F3
  - **Blocked By**: Task 1

  **References**:
  - 当前基准: ~2.13s

  **Acceptance Criteria**:
  - [ ] 启动时间数据记录
  - [ ] 对比报告生成

  **QA Scenarios**:

  ```
  Scenario: 启动时间测量
    Tool: Bash
    Steps:
      1. time bun run --conditions=browser ./src/index.ts --help
      2. 记录时间
    Expected Result: 时间 < 2s
    Evidence: .sisyphus/evidence/task-2-timing.txt
  ```

  **Commit**: NO

- [x] 3. models.ts 延迟 refresh 调用

  **What to do**:
  - 将模块作用域的 `ModelsDev.refresh()` 移到首次使用时
  - 移除模块作用域的 `setInterval`
  - 提供显式初始化函数

  **Must NOT do**:
  - 不改变 ModelsDev 的 API
  - 不移除刷新功能
  - 不在模块作用域发起网络请求

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解模块加载和延迟初始化
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1

  **References**:
  - `src/provider/models.ts:175-182` - 当前的模块作用域网络请求

  **Acceptance Criteria**:
  - [ ] 文件修改完成: src/provider/models.ts
  - [ ] 无模块作用域网络请求
  - [ ] `bun run --conditions=browser ./src/index.ts --help` 不触发网络请求

  **QA Scenarios**:

  ```
  Scenario: --help 不触发网络请求
    Tool: Bash
    Steps:
      1. time bun run --conditions=browser ./src/index.ts --help
      2. 检查启动时间不应包含网络延迟
    Expected Result: 启动快速完成
    Evidence: .sisyphus/evidence/task-3-no-network.txt

  Scenario: run 命令正常工作
    Tool: Bash
    Steps:
      1. timeout 10 bun dev run "hello" 2>&1 || true
      2. 检查命令执行
    Expected Result: 命令正常执行
    Evidence: .sisyphus/evidence/task-3-run-cmd.txt
  ```

  **Commit**: YES
  - Message: `perf(models): defer network request to first use`
  - Files: `src/provider/models.ts`

- [x] 4. 验证 models 功能正常

  **What to do**:
  - 运行相关测试
  - 验证 models 刷新功能正常

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单验证任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: F2
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [ ] 测试通过
  - [ ] 功能正常

  **Commit**: NO

- [x] 5. provider.ts AI SDK 动态导入

  **What to do**:
  - 将 20+ AI SDK 静态导入改为动态导入
  - 使用 import() 按需加载
  - 缓存已加载的 SDK

  **Must NOT do**:
  - 不改变 Provider API
  - 不移除任何 provider 支持
  - 不引入同步导入

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解动态导入和类型系统
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 3

  **References**:
  - `src/provider/provider.ts:27-54` - 当前的静态导入

  **Acceptance Criteria**:
  - [ ] 文件修改完成: src/provider/provider.ts
  - [ ] 使用动态导入
  - [ ] TypeScript 类型正确

  **QA Scenarios**:

  ```
  Scenario: provider 正常工作
    Tool: Bash
    Steps:
      1. bun test src/provider/
      2. 检查测试通过
    Expected Result: 测试通过
    Evidence: .sisyphus/evidence/task-5-provider-test.txt
  ```

  **Commit**: YES
  - Message: `perf(provider): dynamic imports for AI SDKs`
  - Files: `src/provider/provider.ts`

- [ ] 6. theme.tsx 主题按需加载

  **What to do**:
  - 将 35+ JSON 主题文件改为按需加载
  - 使用动态导入或懒加载模式

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端 UI 相关
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 5, 7)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `src/cli/cmd/tui/context/theme.tsx:6-38` - 当前的静态导入

  **Acceptance Criteria**:
  - [ ] 文件修改完成
  - [ ] 主题按需加载
  - [ ] TUI 正常显示

  **Commit**: YES
  - Message: `perf(theme): lazy load themes`
  - Files: `src/cli/cmd/tui/context/theme.tsx`

- [ ] 7. 验证动态导入功能

  **What to do**:
  - 测试动态导入是否正常工作
  - 运行相关测试

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单验证任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: F2
  - **Blocked By**: Tasks 5, 6

  **Acceptance Criteria**:
  - [ ] 测试通过
  - [ ] 功能正常

  **Commit**: NO

- [ ] 8. 命令惰性加载探索

  **What to do**:
  - 探索 yargs 命令惰性加载方案
  - 评估优化效果
  - 实施可行的优化

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要深入理解 yargs 和模块系统
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:
  - `src/index.ts:3-37` - 所有命令的静态导入

  **Acceptance Criteria**:
  - [ ] 优化方案确定
  - [ ] 测试通过

  **Commit**: YES
  - Message: `perf(cli): lazy load commands`
  - Files: `src/index.ts`

- [ ] 9. 工具惰性加载优化

  **What to do**:
  - 将 run.ts 中的工具导入改为惰性加载
  - 评估优化效果

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解工具加载机制
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Task 8)
  - **Blocks**: F2
  - **Blocked By**: Task 8

  **References**:
  - `src/cli/cmd/run.ts:16-28` - 所有工具的静态导入

  **Acceptance Criteria**:
  - [ ] 优化完成
  - [ ] 测试通过

  **Commit**: YES
  - Message: `perf(cli): lazy load tools`
  - Files: `src/cli/cmd/run.ts`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **启动时间对比验证** — `quick`
      对比优化前后的启动时间，确保达到 < 500ms 目标。
      输出: `优化前: Xs | 优化后: Ys | 改善: Z% | VERDICT: PASS/FAIL`

- [ ] F2. **功能回归测试** — `unspecified-high`
      运行所有现有测试，确保功能未受损。
      输出: `Tests [N pass/N fail] | VERDICT: PASS/FAIL`

- [ ] F3. **性能基准测试报告** — `quick`
      生成详细的性能对比报告。
      输出: 详细的时间分解报告

- [ ] F4. **代码质量检查** — `unspecified-high`
      检查代码质量，确保无 AI slop。
      输出: `Code Quality [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **Wave 1 完成**: `perf(global): lazy initialization for faster startup`
- **Wave 2 完成**: `perf(models): defer network request to first use`
- **Wave 3 完成**: `perf(provider,theme): dynamic imports for AI SDKs and themes`
- **Wave 4 完成**: `perf(cli): lazy load commands and tools`

---

## Success Criteria

### Verification Commands

```bash
# 启动时间测试
time bun run --conditions=browser ./src/index.ts --help
# 预期: < 0.5s

# 功能测试
bun test
# 预期: all pass

# TUI 启动测试
timeout 5 bun dev --help
# 预期: 正常显示帮助
```

### Final Checklist

- [ ] 所有 "Must Have" 已实现
- [ ] 所有 "Must NOT Have" 已避免
- [ ] 所有测试通过
- [ ] 启动时间 < 500ms
