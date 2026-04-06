# PEPU 代码问题修复计划

## TL;DR

> **Quick Summary**: 修复 `代码问题.md` 中 17/18 个已验证问题 + 二次审查新发现的 9 个遗漏问题，共 26 个问题。统一符号约定、消除伪实现、修复致命 Bug、清理冗余文件、合并 8 个 PEPU 版本为唯一 `method_pepu.m`、修复 DOA 估计缺陷。
>
> **Deliverables**:
>
> - 统一符号约定（φ = +2πfτ），修复所有方法的 tau 计算公式（含 QG v2 符号确认）
> - 删除/重命名伪实现（MCF ×2、LS、SR 独立版）
> - 修复 PEPU enhanced 的 d_max=0.5 硬编码、负 TDOA 截断、搜索范围不对称
> - 修复 PEPU v2 的维度转置、回溯崩溃、自适应 K 对负 TDOA 失效
> - 修复 weighted_least_squares 权重未使用
> - 修复 sparse_recon_estimate 只搜索正 TDOA
> - 修复 DOA 估计：atand→atan2d、方位角范围统一
> - 合并 8 个 PEPU 版本为唯一 `method_pepu.m`（含 v2_final 的修复）
> - 清理 `src/` 下 4 个冗余独立实现文件
> - 提取公共工具函数到 `utils/`，消除重复代码
> - 统一所有方法的默认 freq_range
>
> **Estimated Effort**: Large (~3-4 小时)
> **Parallel Execution**: YES - 6 waves
> **Critical Path**: T1 (符号统一) → T9 (PEPU 合并) → T15 (集成验证)

---

## Context

### Original Request

用户要求检查 `代码问题.md` 中列出的问题是否属实，并制定修复计划。

### 审查结果

**17/18 条完全属实，1 条部分属实。** 所有核心 Bug 均已通过代码逐行验证。

### 关键发现（原审查 17/18 属实）

- `method_min_cost_flow.m` 是 Itoh + 3σ 异常值修正，不是 MCF
- `method_least_squares.m` 是纯 Itoh 累积，不是 LS
- 3 个方法使用 `-slope`（负号），其余使用 `+slope`（正号），符号打架
- PEPU 有 6 个版本（v2, v3, global, adaptive, enhanced, optimal），逻辑互相矛盾
- `method_pepu_v2.m` 存在维度转置 + 回溯崩溃双重致命 Bug
- `method_weighted_least_squares.m` 的权重变量计算后从未使用

### 二次审查新发现（9 个遗漏问题）

- **遗漏 3 个 PEPU 版本文件**：`method_improved_pepu.m`, `method_pepu_v2_final.m`, `method_quality_guided_v2.m`，总计 8 个 PEPU 变体
- **`src/` 下 4 个独立实现文件**：`min_cost_flow_unwrap.m`（DP 求解，非网络流）、`quality_guided_unwrap.m`、`sparse_recon_estimate.m`（只搜索正 TDOA）、`select_path.m`
- **`sparse_recon_estimate.m` 只搜索正 TDOA**：第 136/154 行从 0 开始
- **`solve_doa_from_tdoa_pairs.m` 使用 `atand` 而非 `atan2d`**：第 71 行，象限判断错误
- **`estimate_doa_from_phase.m` 方位角范围 [0,360)**：与 v3.1 框架 [-180,180] 冲突
- **`method_quality_guided_v2.m` 正号 vs `method_quality_guided.m` 负号**：同一方法不同版本符号打架
- **文件总数远超 18 个**：methods/ 下 19 个 + src/ 下 4 个 = 23+ 个文件

---

## Work Objectives

### Core Objective

修复所有已验证的代码问题，使代码库达到可投稿 JASA 的质量标准。

### Concrete Deliverables

- 修复后的 `matlab/src/methods/` 目录（仅保留有效方法）
- 统一的 `matlab/utils/` 公共工具函数
- 唯一 `method_pepu.m` 实现
- 修复验证脚本

### Definition of Done

- [ ] 所有方法 tau 符号统一为 `+slope / (2*pi) * 1e6`
- [ ] 伪实现方法已删除或重命名
- [ ] PEPU 合并为唯一版本
- [ ] 所有默认 freq_range 统一
- [ ] 无外部依赖缺失（generate_candidates, wrap_to_pi 可用）
- [ ] 修复验证脚本通过

### Must Have

- 符号约定统一为 φ = +2πfτ（与 v3.1 框架一致）
- TDOA 搜索范围覆盖 [-666.7, 666.7] μs
- d_max = 1.0 m（阵列最大基线）
- PEPU 不依赖 Itoh 预估计定边界

### Must NOT Have

- 不引入新的方法文件（只修复/合并/删除现有文件）
- 不改变方法接口签名（tau_est, metrics 输出格式不变）
- 不修改 plan.md 中的实验框架设计
- 不引入 MATLAB 工具箱依赖（仅用基础 + Signal Processing）

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: NO (MATLAB 环境不可用)
- **Automated tests**: None（静态代码审查验证）
- **Framework**: N/A
- **Agent-Executed QA**: 逐文件读取验证修复内容

### QA Policy

每个任务通过静态代码审查验证：

- 符号公式正确性（grep 所有 tau_est 计算行）
- 搜索范围对称性（grep 所有 linspace/range 定义）
- 参数一致性（grep 所有 freq_range/d_max 默认值）
- 文件完整性（确认无缺失依赖）

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 符号统一 + 伪实现清理):
├── T1: 统一所有方法的 τ 符号约定 [quick]
├── T2: 删除/重命名伪实现方法 [quick]
├── T3: 统一默认 freq_range 参数 [quick]
└── T4: 修复 method_pepu_enhanced d_max 硬编码 [quick]

Wave 2 (After Wave 1 — 致命 Bug 修复):
├── T5: 修复 method_pepu_v2 维度转置 + 回溯崩溃 [unspecified-high]
├── T6: 修复 weighted_least_squares 权重未使用 [quick]
├── T7: 修复 PEPU 系列负 TDOA 搜索范围 [quick]
└── T8: 修复 PEPU enhanced 有效性检验负 TDOA 排除 [quick]

Wave 3 (After Wave 2 — 二次审查遗漏修复):
├── T10: 修复 sparse_recon_estimate 只搜索正 TDOA [quick]
├── T11: 修复 DOA 估计 atand→atan2d + 方位角范围 [quick]
├── T12: 清理 src/ 下 4 个冗余独立实现文件 [quick]
└── T13: 确认 method_quality_guided_v2 符号正确 [quick]

Wave 4 (After Wave 3 — PEPU 合并):
└── T9: 合并 8 个 PEPU 版本为唯一 method_pepu.m [deep]

Wave 5 (After Wave 4 — 工程改进):
├── T14: 提取公共工具函数到 utils/ [quick]
├── T15: 修复 method_pepu.m find_best_start 越界 [quick]
└── T16: 修复 normalize 命名冲突 [quick]

Wave 6 (After Wave 5 — 最终验证):
└── T17: 修复验证脚本 + 完整性检查 [unspecified-high]
```

### Dependency Matrix

- T1-T4: 无依赖，可并行
- T5: 依赖 T1（符号统一后修复）
- T6-T8: 依赖 T1（符号统一后修复）
- T10-T13: 依赖 T1（符号统一后修复）
- T9: 依赖 T1, T4, T5, T6, T7, T8, T10, T13（所有修复完成后合并）
- T14-T16: 依赖 T9（PEPU 合并后提取工具）
- T17: 依赖 T1-T16（所有修复完成后验证）

### Agent Dispatch Summary

- Wave 1: 4 tasks (all `quick`)
- Wave 2: 4 tasks (1 `unspecified-high`, 3 `quick`)
- Wave 3: 4 tasks (all `quick`)
- Wave 4: 1 task (`deep`)
- Wave 5: 3 tasks (all `quick`)
- Wave 6: 1 task (`unspecified-high`)

---

## TODOs

- [ ] 1. 统一所有方法的 τ 符号约定

  **What to do**:
  - 将以下文件的 tau_est 计算公式从 `-slope / (2*pi) * 1e6` 改为 `slope / (2*pi) * 1e6`：
    - `method_least_squares.m:71`
    - `method_quality_guided.m:132`
    - `method_sparse_recon.m:62`
  - 同时删除这些文件中错误的注释"交叉谱相位 φ = -2πfτ"
  - 确认 `method_itoh.m`, `method_dct_unwrap.m`, `method_pepu.m` 等使用正号的文件保持不变
  - 验证：grep 所有文件中 `tau_est =` 行，确保全部使用正号

  **Must NOT do**:
  - 不修改 `method_itoh.m`, `method_dct_unwrap.m`, `method_pepu.m` 等已正确的文件
  - 不改变任何方法的其他逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的符号替换，每个文件只改 1-2 行
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T5, T6, T7, T8, T9
  - **Blocked By**: None

  **References**:
  - `matlab/src/methods/method_least_squares.m:71` - 当前使用 `-slope`，需改为 `slope`
  - `matlab/src/methods/method_quality_guided.m:132` - 当前使用 `-slope`，需改为 `slope`
  - `matlab/src/methods/method_sparse_recon.m:62` - 当前使用 `-slope`，需改为 `slope`
  - `matlab/src/methods/method_itoh.m:67` - 已正确使用 `slope`，作为参考标准

  **Acceptance Criteria**:
  - [ ] grep `tau_est = .*slope` 所有结果均为 `slope / (2*pi) * 1e6`（无负号）
  - [ ] 三个文件的错误注释已删除

  **QA Scenarios**:

  ```
  Scenario: 符号一致性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "tau_est = .*slope" matlab/src/methods/*.m
      2. 检查所有匹配行是否使用 `slope / (2*pi) * 1e6`（无负号）
    Expected Result: 所有方法使用统一的正号公式
    Evidence: .sisyphus/evidence/task-1-sign-check.txt
  ```

  **Commit**: YES (group with T2, T3, T4)
  - Message: `fix(methods): unify tau sign convention to +slope/(2*pi)`
  - Pre-commit: grep 验证符号一致性

- [ ] 2. 删除/重命名伪实现方法

  **What to do**:
  - **删除** `method_min_cost_flow.m` — 它是 Itoh + 3σ 异常值修正，不是真正的 MCF
  - **删除** `method_least_squares.m` — 它是纯 Itoh 累积，不是真正的 LS
  - 如果有其他文件引用这两个方法，删除对应的调用代码
  - 注意：`method_dct_unwrap.m` 是真正的 LS 代表（用 DCT 解泊松方程），保留

  **Must NOT do**:
  - 不删除 `method_dct_unwrap.m`（它是真正的 LS 实现）
  - 不修改其他方法的逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 删除文件 + 清理引用，简单操作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T9, T13
  - **Blocked By**: None

  **References**:
  - `matlab/src/methods/method_min_cost_flow.m` - 伪 MCF 实现，需删除
  - `matlab/src/methods/method_least_squares.m` - 伪 LS 实现，需删除
  - `matlab/src/methods/method_dct_unwrap.m` - 真正的 LS 实现，保留

  **Acceptance Criteria**:
  - [ ] `method_min_cost_flow.m` 已删除
  - [ ] `method_least_squares.m` 已删除
  - [ ] 无其他文件引用这两个已删除的方法

  **QA Scenarios**:

  ```
  Scenario: 伪实现文件已删除
    Tool: Bash (ls)
    Steps:
      1. ls matlab/src/methods/method_min_cost_flow.m → 应返回 "No such file"
      2. ls matlab/src/methods/method_least_squares.m → 应返回 "No such file"
    Expected Result: 两个文件均不存在
    Evidence: .sisyphus/evidence/task-2-files-deleted.txt

  Scenario: 无残留引用
    Tool: Bash (grep)
    Steps:
      1. grep -rn "method_min_cost_flow\|method_least_squares" matlab/
      2. 确认无残留引用
    Expected Result: 无匹配结果
    Evidence: .sisyphus/evidence/task-2-no-references.txt
  ```

  **Commit**: YES (group with T1, T3, T4)
  - Message: `fix(methods): remove fake MCF and LS implementations`
  - Pre-commit: grep 验证无残留引用

- [ ] 3. 统一默认 freq_range 参数

  **What to do**:
  - 将所有方法的默认 `freq_range` 统一为 `[8000, 12000]`（与 v3.1 框架一致）
  - 需要修改的文件：
    - `method_itoh.m:35` — 当前 `[1000, 5000]`
    - `method_dct_unwrap.m:32` — 当前 `[1000, 5000]`
    - `method_quality_guided.m:32` — 当前 `[1000, 5000]`
    - `method_sparse_recon.m:34` — 当前 `[1000, 5000]`
    - `method_pepu.m:36` — 当前 `[5000, 20000]`
    - `method_pepu_global.m:34` — 当前 `[5000, 20000]`
    - `method_pepu_adaptive.m:25` — 当前 `[5000, 20000]`
    - `method_pepu_enhanced.m:34` — 当前 `[5000, 20000]`
    - `method_pepu_optimal.m:34` — 当前 `[5000, 20000]`
    - `method_pepu_v2.m:35` — 当前 `[1000, 5000]`
    - `method_pepu_v3.m:33` — 当前 `[5000, 20000]`
    - `method_pepu_hybrid.m:29` — 当前 `[5000, 20000]`
    - `method_weighted_least_squares.m:36` — 当前 `[1000, 5000]`

  **Must NOT do**:
  - 不修改方法的其他逻辑
  - 不改变 params 结构体的其他字段

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的参数值替换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T9, T13
  - **Blocked By**: None

  **References**:
  - `readme.md:103-104` — 冻结参数：频率范围 8-12 kHz
  - `plan.md:66-67` — 全局冻结参数：f_min=8000, f_max=12000

  **Acceptance Criteria**:
  - [ ] 所有方法的默认 freq_range 为 `[8000, 12000]`

  **QA Scenarios**:

  ```
  Scenario: freq_range 一致性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "freq_range = \[" matlab/src/methods/*.m
      2. 检查所有匹配行是否为 `[8000, 12000]`
    Expected Result: 所有方法使用统一的 [8000, 12000]
    Evidence: .sisyphus/evidence/task-3-freq-range-check.txt
  ```

  **Commit**: YES (group with T1, T2, T4)
  - Message: `fix(methods): unify default freq_range to [8000, 12000]`
  - Pre-commit: grep 验证 freq_range 一致性

- [ ] 4. 修复 method_pepu_enhanced d_max 硬编码

  **What to do**:
  - 将 `method_pepu_enhanced.m:53` 的 `d_max = 0.5` 改为 `d_max = 1.0`
  - 这会影响 tau_max 的计算：从 333.3 μs 改为 666.7 μs
  - 同时检查 K 的计算是否正确反映新的 tau_max

  **Must NOT do**:
  - 不修改方法的其他逻辑
  - 不改变 K 的计算公式（只确保 d_max 正确）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单行参数修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T9
  - **Blocked By**: None

  **References**:
  - `matlab/src/methods/method_pepu_enhanced.m:53` — 当前 `d_max = 0.5`
  - `readme.md:66-67` — 冻结参数：水平/垂直孔径均为 1.0 m
  - `readme.md:88` — tau_max = 1.0/1500 = 666.7 μs

  **Acceptance Criteria**:
  - [ ] `d_max = 1.0` 在 method_pepu_enhanced.m 中
  - [ ] `tau_max` 计算结果为 666.7 μs

  **QA Scenarios**:

  ```
  Scenario: d_max 值检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "d_max" matlab/src/methods/method_pepu_enhanced.m
    Expected Result: d_max = 1.0
    Evidence: .sisyphus/evidence/task-4-dmax-check.txt
  ```

  **Commit**: YES (group with T1, T2, T3)
  - Message: `fix(pepu): correct d_max from 0.5 to 1.0 in enhanced variant`
  - Pre-commit: grep 验证 d_max 值

- [ ] 5. 修复 method_pepu_v2 维度转置 + 回溯崩溃

  **What to do**:
  - **维度转置修复**：
    - `method_pepu_v2.m:245` — `[num_levels, N] = size(candidates)` 改为 `[N, num_levels] = size(candidates)`
    - 注意：`generate_candidates` 返回 `N x (2K+1)`，但 v2 第 64 行生成的是 `(2K+1) x N`
    - 需要统一候选矩阵的维度方向，建议统一为 `N x (2K+1)`（与 generate_candidates 一致）
  - **回溯崩溃修复**：
    - `method_pepu_v2.m:336-384` — `global_dp_refinement` 函数中：
      - 前向传播时添加 `psi` 矩阵记录前驱节点
      - 回溯时直接使用 `psi` 矩阵，而非浮点相等判断
    - 同时修复 `multiresolution_search` 中同样的维度问题（第 245, 327 行）

  **Must NOT do**:
  - 不改变 Viterbi 算法的核心逻辑
  - 不修改其他方法的实现

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及矩阵维度和 DP 回溯逻辑，需要谨慎处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T7, T8)
  - **Parallel Group**: Wave 2 (with T6, T7, T8)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/methods/method_pepu_v2.m:63-66` — candidate_phase 生成维度为 (2K+1) x N
  - `matlab/src/methods/method_pepu_v2.m:245` — 错误的 size 解包
  - `matlab/src/methods/method_pepu_v2.m:336-384` — global_dp_refinement 回溯逻辑
  - `matlab/src/generate_candidates.m:29` — 正确维度：Nf x (2K+1)

  **Acceptance Criteria**:
  - [ ] candidate_phase 维度统一为 N x (2K+1)
  - [ ] size() 解包正确：`[N, num_levels] = size(candidates)`
  - [ ] global_dp_refinement 使用 psi 矩阵回溯
  - [ ] 无 candidates(0, i) 越界风险

  **QA Scenarios**:

  ```
  Scenario: 维度一致性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "size(candidates)" matlab/src/methods/method_pepu_v2.m
      2. 确认解包顺序为 [N, num_levels]
    Expected Result: 所有 size 解包正确
    Evidence: .sisyphus/evidence/task-5-dim-check.txt

  Scenario: psi 矩阵回溯检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "psi" matlab/src/methods/method_pepu_v2.m
      2. 确认前向传播中有 psi 赋值
      3. 确认回溯中使用 psi 矩阵
    Expected Result: psi 矩阵正确维护和使用
    Evidence: .sisyphus/evidence/task-5-psi-check.txt
  ```

  **Commit**: YES
  - Message: `fix(pepu-v2): fix dimension transpose and DP backtracking crash`
  - Pre-commit: grep 验证维度和 psi 矩阵

- [ ] 6. 修复 weighted_least_squares 权重未使用

  **What to do**:
  - `method_weighted_least_squares.m:81-82` — 将 `w` 应用到累积计算中
  - 修改为加权累积：`unwrapped_new(i) = unwrapped_new(i-1) + w * grad(i-1)`
  - 或者更合理的做法：使用加权最小二乘拟合而不是简单累积

  **Must NOT do**:
  - 不改变方法的整体框架（IRLS 迭代）
  - 不修改权重计算逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单行修复，将已计算的权重应用到累积中
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T7, T8)
  - **Parallel Group**: Wave 2 (with T5, T7, T8)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/methods/method_weighted_least_squares.m:81-82` — w 计算但未使用
  - `matlab/src/methods/method_weighted_least_squares.m:47-60` — 权重计算逻辑

  **Acceptance Criteria**:
  - [ ] 权重 `w` 在累积计算中被使用

  **QA Scenarios**:

  ```
  Scenario: 权重使用检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "w" matlab/src/methods/method_weighted_least_squares.m
      2. 确认 w 在累积计算中被引用
    Expected Result: w 出现在累积计算行中
    Evidence: .sisyphus/evidence/task-6-weight-check.txt
  ```

  **Commit**: YES
  - Message: `fix(wls): apply computed weights in accumulation loop`
  - Pre-commit: grep 验证权重使用

- [ ] 7. 修复 PEPU 系列负 TDOA 搜索范围

  **What to do**:
  - `method_pepu_global.m:69` — `tau_list = linspace(1, 500, 500)` 改为 `linspace(-666.7, 666.7, 1334)`
  - `method_pepu_adaptive.m:159` — `tau_candidates = 1:500` 改为 `-666:666`
  - `method_pepu_adaptive.m:222` — `tau_coarse = 1:10:500` 改为 `-666:10:666`
  - `method_pepu_adaptive.m:234` — `tau_fine` 范围也需要支持负值
  - `method_pepu_v2.m:130` — `tau = max(1, min(tau, 2000))` 改为 `tau = max(-666.7, min(tau, 666.7))`
  - `method_pepu_enhanced.m:270` — `tau = max(1, min(tau, 500))` 改为 `tau = max(-666.7, min(tau, 666.7))`

  **Must NOT do**:
  - 不修改已正确支持负 TDOA 的方法（如 method_pepu_hybrid.m 已修复为 -500:500）
  - 不改变搜索步进精度

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的搜索范围修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6, T8)
  - **Parallel Group**: Wave 2 (with T5, T6, T8)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/methods/method_pepu_hybrid.m:45` — 已正确修复为 -500:500，作为参考
  - `readme.md:88` — tau_max = 666.7 μs

  **Acceptance Criteria**:
  - [ ] 所有搜索范围覆盖 [-666.7, 666.7] μs
  - [ ] 无 `max(1, ...)` 截断负值

  **QA Scenarios**:

  ```
  Scenario: 搜索范围对称性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "linspace\|tau_candidates\|tau_coarse\|max(1" matlab/src/methods/method_pepu_*.m
      2. 确认所有搜索范围对称覆盖负值
    Expected Result: 所有搜索范围包含负值
    Evidence: .sisyphus/evidence/task-7-range-check.txt
  ```

  **Commit**: YES
  - Message: `fix(pepu): extend TDOA search range to [-666.7, 666.7] μs`
  - Pre-commit: grep 验证搜索范围

- [ ] 8. 修复 PEPU enhanced 有效性检验负 TDOA 排除

  **What to do**:
  - `method_pepu_enhanced.m:202` — `expected_slope_range = 2*pi * [1e-6, 500e-6]` 改为 `2*pi * [-666.7e-6, 666.7e-6]`
  - 同时修复第 203 行的条件判断，使其正确处理负斜率

  **Must NOT do**:
  - 不修改方法的其他逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单行参数范围修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6, T7)
  - **Parallel Group**: Wave 2 (with T5, T6, T7)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/methods/method_pepu_enhanced.m:202-203` — 当前只有正范围
  - `readme.md:88` — tau_max = 666.7 μs

  **Acceptance Criteria**:
  - [ ] expected_slope_range 覆盖负斜率

  **QA Scenarios**:

  ```
  Scenario: 斜率范围对称性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "expected_slope_range" matlab/src/methods/method_pepu_enhanced.m
    Expected Result: 范围包含负值
    Evidence: .sisyphus/evidence/task-8-slope-range-check.txt
  ```

  **Commit**: YES
  - Message: `fix(pepu-enhanced): fix slope validation range to include negative TDOA`
  - Pre-commit: grep 验证斜率范围

- [ ] 9. 合并 8 个 PEPU 版本为唯一 method_pepu.m

  **What to do**:
  - 删除以下文件：
    - `method_pepu_v2.m`
    - `method_pepu_v2_final.m`
    - `method_pepu_v3.m`
    - `method_pepu_global.m`
    - `method_pepu_adaptive.m`
    - `method_pepu_enhanced.m`
    - `method_pepu_optimal.m`
    - `method_pepu_hybrid.m`
    - `method_improved_pepu.m`
  - 重写 `method_pepu.m`，融合各版本闪光点：
    1. **全局粗搜**：在 [-666.7, 666.7] μs 范围内，以 1 μs 步进，计算每个候选 TDOA 的加权线性残差
    2. **局部精搜**：在粗搜最优点的 ±2 μs 范围内，以 0.05 μs 步进进行精搜
    3. **幅度加权**：如果 params.amplitude 可用，使用互谱幅度加权
    4. **不依赖 Itoh 预估计**：直接使用物理边界 [-666.7, 666.7] μs
    5. **符号统一**：使用 `+slope / (2*pi) * 1e6`
    6. **默认 freq_range**：[8000, 12000]
    7. **吸收 v2_final 的修复**：近零保护（abs(tau)<0.5 置零）、自适应层惩罚

  **Must NOT do**:
  - 不引入 Viterbi 复杂层级惩罚调参
  - 不依赖 Itoh 结果定搜索边界
  - 不改变方法接口签名

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解 8 个版本的算法逻辑，提取最优部分，编写干净的新实现
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Wave 3)
  - **Blocks**: T14, T15, T16, T17
  - **Blocked By**: T1, T4, T5, T6, T7, T8, T10, T13

  **References**:
  - `matlab/src/methods/method_pepu_optimal.m:71-98` — 粗搜+精搜模式（最优架构）
  - `matlab/src/methods/method_pepu_enhanced.m:68-81` — 幅度加权质量图
  - `matlab/src/methods/method_pepu_hybrid.m:45-52` — 周期图法全局搜索（支持负 TDOA）
  - `matlab/src/methods/method_pepu_v3.m:85-99` — 迭代优化模式
  - `matlab/src/methods/method_pepu_v2_final.m:76-88` — 自适应层惩罚（SNR 分级）
  - `matlab/src/methods/method_pepu_v2_final.m:176-186` — 近零保护 + 符号保留截断
  - `matlab/src/generate_candidates.m` — 候选相位生成
  - `readme.md:88` — tau_max = 666.7 μs

  **Acceptance Criteria**:
  - [ ] 8 个旧 PEPU 版本文件已删除
  - [ ] method_pepu.m 实现全局粗搜 + 局部精搜
  - [ ] 搜索范围 [-666.7, 666.7] μs
  - [ ] 不依赖 Itoh 预估计
  - [ ] 支持幅度加权
  - [ ] 符号统一为正号
  - [ ] 默认 freq_range 为 [8000, 12000]
  - [ ] 包含近零保护和符号保留截断

  **QA Scenarios**:

  ```
  Scenario: 旧 PEPU 版本已删除
    Tool: Bash (ls)
    Steps:
      1. ls matlab/src/methods/method_pepu_v*.m matlab/src/methods/method_pepu_global.m matlab/src/methods/method_pepu_adaptive.m matlab/src/methods/method_pepu_enhanced.m matlab/src/methods/method_pepu_optimal.m matlab/src/methods/method_pepu_hybrid.m matlab/src/methods/method_improved_pepu.m
    Expected Result: 所有文件均不存在
    Evidence: .sisyphus/evidence/task-9-old-files-deleted.txt

  Scenario: 新 PEPU 实现检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "666.7\|tau_min\|tau_max" matlab/src/methods/method_pepu.m
      2. 确认搜索范围正确
      3. grep -n "Itoh\|itoh" matlab/src/methods/method_pepu.m
      4. 确认不依赖 Itoh
    Expected Result: 搜索范围正确，无 Itoh 依赖
    Evidence: .sisyphus/evidence/task-9-pepu-implementation.txt
  ```

  **Commit**: YES
  - Message: `refactor(pepu): merge 8 PEPU variants into single optimized implementation`
  - Pre-commit: 验证旧文件已删除，新文件存在

- [ ] 10. 修复 sparse_recon_estimate 只搜索正 TDOA

  **What to do**:
  - `sparse_recon_estimate.m:136` — `coarse_candidates = (0:coarse_step_us:max_tdoa_us)' * 1e-6` 改为 `(-max_tdoa_us:coarse_step_us:max_tdoa_us)' * 1e-6`
  - `sparse_recon_estimate.m:144` — `tau_min_us = max(0, ...)` 改为 `tau_min_us = max(-max_tdoa_us, ...)`
  - `sparse_recon_estimate.m:154` — 回退范围也从 0 开始改为对称
  - 注意：此文件在 `src/` 下而非 `methods/` 下，接口不同（输出 unwrapped_phase + tau_estimate）

  **Must NOT do**:
  - 不改变方法的字典矩阵构建逻辑
  - 不修改稀疏优化算法

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的搜索范围修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T11, T12, T13)
  - **Parallel Group**: Wave 3 (with T11, T12, T13)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/sparse_recon_estimate.m:136,144,154` — 只搜索正 TDOA
  - `readme.md:88` — tau_max = 666.7 μs

  **Acceptance Criteria**:
  - [ ] coarse_candidates 覆盖负值
  - [ ] fine_candidates 覆盖负值
  - [ ] 回退范围覆盖负值

  **QA Scenarios**:

  ```
  Scenario: 搜索范围对称性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "coarse_candidates\|fine_candidates\|tau_min_us" matlab/src/sparse_recon_estimate.m
      2. 确认所有范围从负值开始
    Expected Result: 所有搜索范围包含负值
    Evidence: .sisyphus/evidence/task-10-sparse-range-check.txt
  ```

  **Commit**: YES
  - Message: `fix(sparse-recon): extend TDOA candidate range to include negative values`
  - Pre-commit: grep 验证搜索范围

- [ ] 11. 修复 DOA 估计 atand→atan2d + 方位角范围

  **What to do**:
  - `solve_doa_from_tdoa_pairs.m:71` — `atand(u_hat(2) / (u_hat(1) + 1e-10))` 改为 `atan2d(u_hat(2), u_hat(1))`
  - 删除第 74-79 行的手动象限处理（atan2d 自动处理）
  - 方位角范围统一为 [-180, 180]（与 v3.1 框架一致）
  - 检查 `estimate_doa_from_phase.m:103-105` — 将 [0, 360) 改为 [-180, 180]

  **Must NOT do**:
  - 不修改 DOA 求解的核心逻辑
  - 不改变 TDOA→DOA 的数学模型

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 函数替换 + 范围调整
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T10, T12, T13)
  - **Parallel Group**: Wave 3 (with T10, T12, T13)
  - **Blocks**: T17
  - **Blocked By**: T1

  **References**:
  - `matlab/src/solve_doa_from_tdoa_pairs.m:71-79` — atand + 手动象限处理
  - `matlab/src/estimate_doa_from_phase.m:99,103-105` — atan2d 正确但范围 [0,360)
  - `matlab/src/estimate_doa.m:128` — 已正确使用 atan2d，作为参考
  - `readme.md:152` — 方位角范围 [-180°, 180°]

  **Acceptance Criteria**:
  - [ ] solve_doa_from_tdoa_pairs 使用 atan2d
  - [ ] 方位角范围统一为 [-180, 180]
  - [ ] 无手动象限处理代码

  **QA Scenarios**:

  ```
  Scenario: atan2d 使用检查
    Tool: Bash (grep)
    Steps:
      1. grep -rn "atand\|atan2d" matlab/src/
      2. 确认无 atand 使用
    Expected Result: 全部使用 atan2d
    Evidence: .sisyphus/evidence/task-11-atan2d-check.txt
  ```

  **Commit**: YES
  - Message: `fix(doa): replace atand with atan2d and unify azimuth range to [-180,180]`
  - Pre-commit: grep 验证无 atand

- [ ] 12. 清理 src/ 下 4 个冗余独立实现文件

  **What to do**:
  - 评估并删除以下文件：
    - `min_cost_flow_unwrap.m` — DP 求解，非真正的网络流，与 methods/ 下的伪 MCF 重复
    - `quality_guided_unwrap.m` — 与 methods/ 下的 QG 重复
    - `sparse_recon_estimate.m` — 与 methods/ 下的 SR 重复（修复后保留或合并）
    - `select_path.m` — 通用路径选择，被 improved_pepu 调用
  - 如果 `sparse_recon_estimate.m` 有独特价值（自适应候选生成），保留并移到 methods/
  - 检查所有 run\_\*.m 和 scripts/ 中的引用，删除调用代码

  **Must NOT do**:
  - 不删除被测试脚本引用的文件（先检查引用）
  - 不修改 methods/ 下的方法逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 文件清理 + 引用检查
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T10, T11, T13)
  - **Parallel Group**: Wave 3 (with T10, T11, T13)
  - **Blocks**: T17
  - **Blocked By**: None

  **References**:
  - `matlab/src/min_cost_flow_unwrap.m` — DP 求解，非网络流
  - `matlab/src/quality_guided_unwrap.m` — QG 独立版
  - `matlab/src/sparse_recon_estimate.m` — SR 独立版
  - `matlab/src/select_path.m` — 路径选择工具

  **Acceptance Criteria**:
  - [ ] 冗余文件已删除或迁移
  - [ ] 无残留引用

  **QA Scenarios**:

  ```
  Scenario: 冗余文件清理检查
    Tool: Bash (ls + grep)
    Steps:
      1. ls matlab/src/min_cost_flow_unwrap.m matlab/src/quality_guided_unwrap.m matlab/src/select_path.m
      2. grep -rn "min_cost_flow_unwrap\|quality_guided_unwrap\|select_path" matlab/
    Expected Result: 文件不存在或无残留引用
    Evidence: .sisyphus/evidence/task-12-cleanup-check.txt
  ```

  **Commit**: YES
  - Message: `cleanup(src): remove redundant standalone implementations`
  - Pre-commit: grep 验证无残留引用

- [ ] 13. 确认 method_quality_guided_v2 符号正确

  **What to do**:
  - `method_quality_guided_v2.m:130` — 已使用 `+slope`，正确
  - `method_quality_guided.m:132` — 使用 `-slope`，错误（已在 T1 修复）
  - 确认 v2 版本无其他符号问题
  - 如果 v2 是改进版，考虑保留 v2 并删除原版 QG

  **Must NOT do**:
  - 不修改 v2 的符号（已正确）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 确认性检查 + 可能的文件删除
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T10, T11, T12)
  - **Parallel Group**: Wave 3 (with T10, T11, T12)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**:
  - `matlab/src/methods/method_quality_guided_v2.m:130` — 已正确使用 +slope
  - `matlab/src/methods/method_quality_guided.m:132` — 使用 -slope（T1 修复）

  **Acceptance Criteria**:
  - [ ] QG v2 符号确认正确
  - [ ] 决定保留 v2 还是原版

  **QA Scenarios**:

  ```
  Scenario: QG v2 符号检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "tau_est = " matlab/src/methods/method_quality_guided_v2.m
    Expected Result: 使用 +slope
    Evidence: .sisyphus/evidence/task-13-qg-v2-sign-check.txt
  ```

  **Commit**: YES
  - Message: `fix(qg-v2): confirm sign convention and remove duplicate QG version`
  - Pre-commit: grep 验证符号

- [ ] 14. 提取公共工具函数到 utils/

  **What to do**:
  - 将以下重复函数提取为共享工具：
    - `itoh_unwrap` — 在 10+ 个文件中重复实现
    - `unwrap_given_tdoa` — 在多个 PEPU 版本中重复
    - `wrap_to_pi` — 已有 `utils/wrap_to_pi.m`，但部分文件使用内联版本
  - 删除各文件中的本地重复实现
  - 确保所有方法文件能正确调用 utils/ 中的函数（通过 addpath 或 MATLAB path）

  **Must NOT do**:
  - 不改变工具函数的接口签名
  - 不修改方法的核心逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 提取重复代码为共享函数
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T15, T16)
  - **Parallel Group**: Wave 5 (with T15, T16)
  - **Blocks**: T17
  - **Blocked By**: T9

  **References**:
  - `matlab/utils/wrap_to_pi.m` — 已存在的 wrap_to_pi 实现
  - `matlab/src/generate_candidates.m` — 已存在的 generate_candidates 实现

  **Acceptance Criteria**:
  - [ ] utils/ 包含 itoh_unwrap, unwrap_given_tdoa
  - [ ] 各方法文件不再重复定义这些函数
  - [ ] 所有调用路径正确

  **QA Scenarios**:

  ```
  Scenario: 工具函数存在性检查
    Tool: Bash (ls)
    Steps:
      1. ls matlab/utils/itoh_unwrap.m matlab/utils/unwrap_given_tdoa.m
    Expected Result: 两个文件均存在
    Evidence: .sisyphus/evidence/task-14-utils-exist.txt

  Scenario: 无重复定义检查
    Tool: Bash (grep)
    Steps:
      1. grep -rn "function.*itoh_unwrap\|function.*unwrap_given_tdoa" matlab/src/methods/*.m
    Expected Result: 无匹配结果（已在 utils/ 中统一定义）
    Evidence: .sisyphus/evidence/task-14-no-duplicates.txt
  ```

  **Commit**: YES
  - Message: `refactor(utils): extract shared functions to eliminate duplication`
  - Pre-commit: grep 验证无重复定义

- [ ] 15. 修复 method_pepu.m find_best_start 越界

  **What to do**:
  - `method_pepu.m:171` — `window = phase(i-window_size/2 : i+window_size/2)` 当 window_size 为奇数时产生 0.5
  - 修复：使用 `floor(window_size/2)` 确保整数索引
  - 同时修复循环边界 `i = window_size:N-window_size` 确保不越界

  **Must NOT do**:
  - 不修改方法的其他逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单行索引修复
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T14, T16)
  - **Parallel Group**: Wave 5 (with T14, T16)
  - **Blocks**: T17
  - **Blocked By**: T9

  **References**:
  - `matlab/src/methods/method_pepu.m:170-171` — 当前越界风险

  **Acceptance Criteria**:
  - [ ] 使用 floor/ceil 确保整数索引
  - [ ] 循环边界正确

  **QA Scenarios**:

  ```
  Scenario: 索引安全性检查
    Tool: Bash (grep)
    Steps:
      1. grep -n "window_size/2" matlab/src/methods/method_pepu.m
      2. 确认使用 floor 或 fix 确保整数
    Expected Result: 使用整数索引
    Evidence: .sisyphus/evidence/task-15-index-check.txt
  ```

  **Commit**: YES
  - Message: `fix(pepu): fix floating-point index in find_best_start`
  - Pre-commit: grep 验证索引修复

- [ ] 16. 修复 normalize 命名冲突

  **What to do**:
  - `method_pepu.m:315-317` — 将 `normalize` 函数重命名为 `norm01`
  - 更新所有调用处（第 158 行）
  - 检查其他文件中是否有同名函数

  **Must NOT do**:
  - 不修改函数的逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的函数重命名
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T14, T15)
  - **Parallel Group**: Wave 5 (with T14, T15)
  - **Blocks**: T17
  - **Blocked By**: T9

  **References**:
  - `matlab/src/methods/method_pepu.m:158,315-317` — normalize 定义和调用

  **Acceptance Criteria**:
  - [ ] 函数重命名为 norm01
  - [ ] 所有调用处已更新

  **QA Scenarios**:

  ```
  Scenario: 命名冲突修复检查
    Tool: Bash (grep)
    Steps:
      1. grep -rn "function.*normalize\|normalize(" matlab/src/methods/method_pepu.m
      2. 确认无 normalize 定义，只有 norm01
    Expected Result: 函数已重命名为 norm01
    Evidence: .sisyphus/evidence/task-16-rename-check.txt
  ```

  **Commit**: YES
  - Message: `fix(pepu): rename normalize to norm01 to avoid MATLAB toolbox conflict`
  - Pre-commit: grep 验证重命名

- [ ] 17. 修复验证脚本 + 完整性检查

  **What to do**:
  - 创建验证脚本 `matlab/scripts/verify_code_fixes.m`
  - 逐项检查所有修复是否生效（覆盖原审查 17 条 + 二次审查 9 条 = 26 条）：
    1. 符号一致性：所有 tau_est 使用正号
    2. 伪实现已删除：MCF ×2, LS, SR 独立版
    3. freq_range 统一：所有方法默认 [8000, 12000]
    4. d_max 正确：enhanced 中为 1.0
    5. PEPU 版本唯一：仅 method_pepu.m 存在
    6. 搜索范围对称：覆盖负 TDOA
    7. 工具函数完整：utils/ 中包含所需函数
    8. 无重复代码：itoh_unwrap 等不在方法文件中重复
    9. DOA 估计：atan2d 使用、方位角范围 [-180,180]
    10. sparse_recon_estimate 搜索范围对称
    11. QG v2 符号正确
    12. src/ 冗余文件已清理
  - 输出 PASS/FAIL 报告

  **Must NOT do**:
  - 不运行 MATLAB 实验（仅静态检查）
  - 不修改方法代码

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要编写全面的验证脚本，覆盖所有 26 个修复点
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (final, after all other tasks)
  - **Blocks**: None
  - **Blocked By**: T1-T16

  **References**:
  - `代码问题.md` — 原始问题列表
  - 本计划中所有任务的 Acceptance Criteria

  **Acceptance Criteria**:
  - [ ] 验证脚本覆盖所有 26 个问题
  - [ ] 运行后输出清晰的 PASS/FAIL 报告
  - [ ] 所有检查项 PASS

  **QA Scenarios**:

  ```
  Scenario: 验证脚本完整性
    Tool: Bash (grep)
    Steps:
      1. grep -c "PASS\|FAIL\|assert" matlab/scripts/verify_code_fixes.m
      2. 确认覆盖所有修复点
    Expected Result: 至少 26 个检查项
    Evidence: .sisyphus/evidence/task-17-verification-script.txt
  ```

  **Commit**: YES
  - Message: `test: add comprehensive code fix verification script (26 checks)`
  - Pre-commit: 运行脚本确认所有检查通过

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep pattern). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Review all changed files for: inconsistent sign conventions, remaining duplicate code, missing edge case handling, MATLAB naming conflicts. Check that all 17 issues from 代码问题.md are addressed.
      Output: `Sign Convention [PASS/FAIL] | Duplicates [CLEAN/N issues] | Edge Cases [N checked] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Read each modified file. Verify: tau_est formula uses +slope, search ranges include negative values, d_max=1.0, freq_range=[8000,12000], psi matrix exists in DP backtracking, weights are applied in WLS. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Tasks [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1 (T1-T4)**: `fix(methods): unify sign convention, remove fake impls, fix defaults`
- **Wave 2 (T5-T8)**: `fix(pepu): fix critical bugs in v2, WLS, search ranges`
- **Wave 3 (T10-T13)**: `fix(misc): fix sparse range, DOA estimation, cleanup src/`
- **Wave 4 (T9)**: `refactor(pepu): merge 8 variants into single optimized implementation`
- **Wave 5 (T14-T16)**: `refactor(utils): extract shared functions, fix edge cases`
- **Wave 6 (T17)**: `test: add comprehensive verification script (26 checks)`

---

## Success Criteria

### Verification Commands

```bash
# 符号一致性
grep -n "tau_est = .*slope" matlab/src/methods/*.m  # 应全部使用 +slope

# 伪实现已删除
ls matlab/src/methods/method_min_cost_flow.m  # 应不存在
ls matlab/src/methods/method_least_squares.m  # 应不存在

# PEPU 版本唯一
ls matlab/src/methods/method_pepu_*.m  # 应不存在（仅 method_pepu.m 保留）

# freq_range 统一
grep -n "freq_range = \[" matlab/src/methods/*.m  # 应全部为 [8000, 12000]

# 搜索范围对称
grep -n "linspace\|tau_candidates" matlab/src/methods/method_pepu.m  # 应包含负值
```

### Final Checklist

- [ ] 所有 "Must Have" 已实现
- [ ] 所有 "Must NOT Have" 已排除
- [ ] 原审查 17/18 个代码问题已修复
- [ ] 二次审查 9 个遗漏问题已修复
- [ ] 验证脚本通过所有 26 个检查
