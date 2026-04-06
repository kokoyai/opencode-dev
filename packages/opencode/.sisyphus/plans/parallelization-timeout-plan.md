# PEPU 实验并行化与超时控制计划

> **计划类型**: 补充计划（配合 pepu-unified-plan.md 使用）
> **计划版本**: v1.0
> **创建日期**: 2026-04-04
> **适用范围**: Phase 7-8 大规模仿真

---

## TL;DR

> **问题**: Phase 7 仿真量 800 万次，串行需 9.3 天
> **解决方案**: 任务分块并行 (parfor) + 超时控制 + 断点续传
> **预期效果**: 8 核并行 ~1.2 天，16 核 ~14 小时

---

## 1. 问题分析

### 1.1 计算量统计

| Phase             | 仿真次数  | 单次时间 | 串行总时间 | 8核并行时间 |
| ----------------- | --------- | -------- | ---------- | ----------- |
| Phase 7 (Scene A) | 8,023,200 | 0.1s     | ~9.3 天    | ~1.2 天     |
| Phase 8 (Scene B) | ~200,000  | 0.1s     | ~5.6 小时  | ~42 分钟    |
| Phase 8 (Scene C) | 25,600    | 0.1s     | ~43 分钟   | ~5 分钟     |
| Phase 8 (Scene D) | ~35,000   | 0.1s     | ~1 小时    | ~8 分钟     |

**关键瓶颈**: Phase 7 的 800 万次仿真必须并行化！

### 1.2 串行时间推导

```
Phase 7 参数:
- SNR: 31 点 (-20:2:40)
- TDOA: 4 种 (10, 50, 100, 200 μs)
- Theta: 19 种 (-180:20:180)
- Phi: 17 种 (-80:10:80)
- N_MC: 200 次

总仿真量 = 31 × 4 × 19 × 17 × 200 = 8,023,200 次

假设每次仿真 0.1 秒（保守估计）:
总时间 = 802,320 秒 ≈ 223 小时 ≈ 9.3 天
```

---

## 2. 并行化策略

### 2.1 策略选择

**推荐策略**: 任务分块并行

```matlab
% 创建任务列表（任务分块策略）
% 每个任务 = 1 组 (SNR, TDOA, Theta, Phi) × 200 次 MC

n_tasks = 31 × 4 × 19 × 17 = 40,04 个任务

parfor i_task = 1:n_tasks
    % 解析任务索引
    [i_snr, i_tdoa, i_theta, i_phi] = ind2sub([31,4,19,17], i_task);

    % 内层 MC 循环（串行，200 次）
    for i_mc = 1:200
        % 单次仿真
    end
end
```

**优点**:

- 40,04 个任务，负载均衡
- 每个任务 200 次 MC，粒度适中
- 通信开销小
- 支持 1-128 核

### 2.2 为什么不用嵌套 parfor?

```matlab
% 错误示例：嵌套 parfor 效率低
parfor i_snr = 1:31
    parfor i_mc = 1:200  % ❌ 嵌套 parfor 不会并行
        % 仿真
    end
end

% 正确：单层 parfor + 任务分块
parfor i_task = 1:4004
    for i_mc = 1:200
        % 仿真
    end
end
```

---

## 3. 超时控制机制

### 3.1 三层级超时

| 层级    | 作用域              | 超时时间 | 实现方式             |
| ------- | ------------------- | -------- | -------------------- |
| 函数级  | 单次仿真            | 10 秒    | `run_with_timeout()` |
| 任务级  | 单个任务（200次MC） | 5 分钟   | `tic/toc` 检查       |
| Phase级 | 整个 Phase          | 无限制   | 用户手动中断         |

### 3.2 函数级超时实现

**任务**: 创建 `timeout_controller.m`

```matlab
function [success, result] = run_with_timeout(fn, timeout_sec, args)
% 带超时的函数执行
%
% 输入:
%   fn          - 函数句柄
%   timeout_sec - 超时时间（秒）
%   args        - 函数参数（cell array）
%
% 输出:
%   success - 是否成功完成
%   result  - 函数返回值

    % MATLAB R2020b+ 支持 backgroundPool
    if verLessThan('matlab', '9.9')
        % 旧版本：timer 实现（见详细设计）
        % ...
    else
        % 新版本：使用 backgroundPool
        f = parfeval(backgroundPool, fn, 1, args{:});
        [success, result] = fetchOutputs(f, 'Timeout', timeout_sec);
    end
end
```

### 3.3 任务级超时实现

```matlab
parfor i_task = 1:n_tasks
    task_start = tic;
    task_timeout = 300; % 5 分钟

    for i_mc = 1:200
        % 检查任务超时
        if toc(task_start) > task_timeout
            warning('任务 %d 超时，跳过剩余 MC', i_task);
            break;
        end

        % 单次仿真（函数级超时）
        [ok, result] = run_with_timeout(@run_single_simulation, 10, {...});
    end
end
```

---

## 4. 断点续传机制

### 4.1 为什么需要断点续传?

- Phase 7 运行时间 ~1 天
- 可能遇到：断电、系统重启、MATLAB 崩溃
- 没有断点续传 = 前功尽弃

### 4.2 实现

**任务**: 创建 `checkpoint_manager.m`

```matlab
function [start_idx, results] = load_checkpoint(phase_name)
% 加载断点
%
% 输入: phase_name - 'scene_A', 'scene_B', etc.
% 输出:
%   start_idx - 从哪个任务继续（1 表示从头开始）
%   results   - 已完成的结果

    checkpoint_file = sprintf('checkpoint_%s.mat', phase_name);

    if exist(checkpoint_file, 'file')
        data = load(checkpoint_file);
        start_idx = data.next_idx;
        results = data.results;
        fprintf('从断点恢复: %s, 从第 %d 个任务继续\n', phase_name, start_idx);
    else
        start_idx = 1;
        results = [];
    end
end

function save_checkpoint(phase_name, completed_idx, results)
% 保存断点
    checkpoint_file = sprintf('checkpoint_%s.mat', phase_name);
    next_idx = completed_idx + 1;
    save(checkpoint_file, 'next_idx', 'results', '-v7.3');
end
```

### 4.3 使用方式

```matlab
% 加载断点
[start_task, results_A] = load_checkpoint('scene_A');

% 并行执行
parfor i_task = start_task:n_tasks
    % ... 仿真 ...

    % 每 100 个任务保存一次断点
    if mod(i_task, 100) == 0
        save_checkpoint('scene_A', i_task, results_A);
    end
end

% 完成后清除断点
delete('checkpoint_scene_A.mat');
```

---

## 5. 实现任务列表

### Wave 1 — 并行基础设施

- [ ] 1. 创建 `timeout_controller.m`
  - **What**: 实现带超时的函数执行
  - **Why**: 防止单次仿真卡死
  - **Acceptance**: 单元测试通过

- [ ] 2. 创建 `checkpoint_manager.m`
  - **What**: 实现断点保存/加载
  - **Why**: 支持长时间运行任务的恢复
  - **Acceptance**: 测试保存/加载正确性

### Wave 2 — 并行仿真脚本

- [ ] 3. 创建 `run_scene_A_parallel.m`
  - **What**: Phase 7 并行版本
  - **Why**: 将 9.3 天缩短到 ~1 天
  - **Acceptance**:
    - 使用 parfor
    - 集成超时控制
    - 集成断点续传
    - 小规模测试通过（N_MC=10）

- [ ] 4. 创建 `run_single_simulation.m`
  - **What**: 单次仿真函数
  - **Why**: 封装仿真逻辑，便于并行调用
  - **Acceptance**:
    - 输入/输出接口明确
    - 异常处理完整
    - 带超时保护

### Wave 3 — 其他场景并行化

- [ ] 5. 创建 `run_scene_B_parallel.m`
  - **What**: Scene B 并行版本
  - **Acceptance**: N_MC=10 测试通过

- [ ] 6. 创建 `run_scene_C_parallel.m`
  - **What**: Scene C 并行版本
  - **Acceptance**: N_MC=10 测试通过

- [ ] 7. 创建 `run_scene_D_parallel.m`
  - **What**: Scene D 并行版本
  - **Acceptance**: N_MC=10 测试通过

### Wave 4 — 监控与优化

- [ ] 8. 创建 `monitor_resources.m`
  - **What**: 实时资源监控
  - **Why**: 发现内存泄漏、CPU 负载不均
  - **Acceptance**: 显示内存/CPU 使用曲线

- [ ] 9. 创建 `run_all_scenes.m`
  - **What**: 一键运行所有场景
  - **Why**: 简化执行流程
  - **Acceptance**: 顺序调用 Scene A-D

---

## 6. 预期性能

### 6.1 理论加速比

| 核心数 | 加速比 | Phase 7 时间 |
| ------ | ------ | ------------ |
| 1      | 1×     | 9.3 天       |
| 4      | ~3.5×  | 2.7 天       |
| 8      | ~6.5×  | 1.4 天       |
| 16     | ~11×   | 20 小时      |
| 32     | ~18×   | 12 小时      |

### 6.2 实际测试建议

```matlab
% 小规模测试（验证正确性）
params.N_MC_A = 10;  % 从 200 降到 10
run_scene_A_parallel(params);
% 预期时间: ~15 分钟（8 核）

% 中规模测试（验证加速比）
params.N_MC_A = 50;  % 从 200 降到 50
run_scene_A_parallel(params);
% 预期时间: ~1.5 小时（8 核）

% 全量运行
params.N_MC_A = 200;
run_scene_A_parallel(params);
% 预期时间: ~1.4 天（8 核）
```

---

## 7. 风险与缓解

| 风险         | 概率 | 影响 | 缓解措施                     |
| ------------ | ---- | ---- | ---------------------------- |
| 内存不足     | 中   | 高   | 任务分块、定期清理、监控脚本 |
| 并行效率低   | 低   | 中   | 负载均衡测试、调整任务粒度   |
| 断点文件损坏 | 低   | 高   | 定期备份、多个断点文件       |
| 超时设置不当 | 中   | 中   | 自适应超时、先小规模测试     |

---

## 8. 验收标准

### 8.1 功能验收

- [ ] `run_scene_A_parallel.m` 运行无错误
- [ ] 超时控制生效（故意设置短超时测试）
- [ ] 断点续传生效（手动中断后恢复）
- [ ] 结果与串行版本一致（小规模对比）

### 8.2 性能验收

- [ ] 8 核加速比 > 5×
- [ ] 内存使用稳定（无泄漏）
- [ ] CPU 利用率 > 80%

### 8.3 可靠性验收

- [ ] 运行 1 小时无崩溃
- [ ] 中断后可恢复
- [ ] 异常情况有明确错误提示

---

## 9. 执行顺序

```
Step 1: 实现 Wave 1（并行基础设施）
  → timeout_controller.m
  → checkpoint_manager.m

Step 2: 实现 Wave 2（并行仿真脚本）
  → run_single_simulation.m
  → run_scene_A_parallel.m
  → 小规模测试（N_MC=10）

Step 3: 实现 Wave 3（其他场景）
  → run_scene_B/C/D_parallel.m

Step 4: 实现 Wave 4（监控与优化）
  → monitor_resources.m
  → run_all_scenes.m

Step 5: 全量运行
  → 运行 Phase 7-8
```

---

## 10. 更新主计划

此计划是 `pepu-unified-plan.md` 的补充。执行时：

1. **Phase 0 完成后**，先执行此并行化计划
2. **创建并行脚本后**，更新 Phase 7-8 的 MATLAB 实现要求
3. **最终执行**时使用并行版本

---

## Success Criteria

- [ ] 所有 9 个任务完成
- [ ] Phase 7 运行时间 < 2 天（8 核）
- [ ] 支持断点续传
- [ ] 支持超时控制
- [ ] 小规模测试通过
