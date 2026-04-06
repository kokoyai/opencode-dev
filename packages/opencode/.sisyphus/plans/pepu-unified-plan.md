# PEPU 论文完整执行计划（融合版）

> **来源文档**: 001-实验框架设计.md v3.2 + 代码审查修复计划
> **计划版本**: v2.0 (融合代码修复 + 实验框架)
> **验证工具**: MATLAB（全程强制）
> **执行方式**: 逐 Phase 顺序执行，每 Phase 含自检断言，失败则停止

---

## 执行总览

```
Phase 0  →  代码修复（26个问题 → 17个任务，6个Wave）
Phase 1  →  信号生成模块 + 相位模糊验证
Phase 2  →  CRLB 函数实现
Phase 3  →  GCC-PHAT 基线实现
Phase 4  →  PEPU 实现（基于修复后的唯一版本）
Phase 5  →  全部 8 种对比方法相位解卷绕实现（删除伪实现后重新规划）
Phase 6  →  LS DOA 后端实现
Phase 7  →  Scene A 全量实验（9 种方法对比）
Phase 8  →  Scene B / C / D 实验
Phase 9  →  结果分析与图表生成
Phase 10 →  数据存档与复现验证
```

每个 Phase 结构：`任务描述 → MATLAB 实现要求 → 自检断言 → 输出物`

---

## Phase 0 — 代码修复（前置条件）

### 任务描述

修复现有代码库中的 26 个已验证问题，使代码达到可投稿 JASA 的质量标准。

### 审查背景

**原审查结果**：`代码问题.md` 中 17/18 条完全属实，1 条部分属实

**二次审查结果**：发现 9 个遗漏问题

**总计**：26 个问题需要修复

### 核心问题分类

| 类别          | 问题数 | 关键问题                                             |
| ------------- | ------ | ---------------------------------------------------- |
| 符号约定打架  | 3      | least_squares, quality_guided, sparse_recon 使用负号 |
| 伪实现        | 4      | MCF (Itoh+3σ), LS (纯Itoh), SR 独立版, MCF 独立版    |
| PEPU 版本混乱 | 8      | 8个版本互相矛盾，v2有致命Bug                         |
| 参数不一致    | 13+    | freq_range 默认值、d_max 硬编码、搜索范围不对称      |
| DOA 估计缺陷  | 2      | atand 象限错误、方位角范围冲突                       |

### MATLAB 修复任务（17个任务，6个Wave）

#### Wave 1 — 符号统一 + 伪实现清理

```
T1: 统一所有方法的 τ 符号约定 [quick]
  - 修复 method_least_squares.m, method_quality_guided.m, method_sparse_recon.m 的 tau_est 公式
  - 从 -slope/(2*pi) 改为 +slope/(2*pi)
  - 验证：grep 所有 tau_est 计算行，确保统一使用正号

T2: 删除/重命名伪实现方法 [quick]
  - 删除 method_min_cost_flow.m (Itoh+3σ，非真正MCF)
  - 删除 method_least_squares.m (纯Itoh累积，非真正LS)
  - 保留 method_dct_unwrap.m (真正的LS实现)

T3: 统一默认 freq_range 参数 [quick]
  - 将所有方法的默认 freq_range 改为 [8000, 12000]
  - 涉及文件：method_itoh, method_dct_unwrap, method_quality_guided, method_sparse_recon, 所有PEPU变体

T4: 修复 method_pepu_enhanced d_max 硬编码 [quick]
  - 将 d_max = 0.5 改为 d_max = 1.0
  - 修正 tau_max 计算：从 333.3 μs 改为 666.7 μs
```

#### Wave 2 — 致命 Bug 修复

```
T5: 修复 method_pepu_v2 维度转置 + 回溯崩溃 [unspecified-high]
  - 维度转置：[num_levels, N] = size(candidates) 改为 [N, num_levels]
  - 回溯崩溃：添加 psi 矩阵记录前驱节点，避免浮点相等判断

T6: 修复 weighted_least_squares 权重未使用 [quick]
  - 将权重 w 应用到累积计算中：unwrapped_new(i) = unwrapped_new(i-1) + w * grad(i-1)

T7: 修复 PEPU 系列负 TDOA 搜索范围 [quick]
  - method_pepu_global: linspace(1,500,500) → linspace(-666.7, 666.7, 1334)
  - method_pepu_adaptive: tau_candidates = 1:500 → -666:666
  - method_pepu_v2, enhanced: max(1, ...) 截断改为 max(-666.7, ...)

T8: 修复 PEPU enhanced 有效性检验负 TDOA 排除 [quick]
  - expected_slope_range = 2*pi * [1e-6, 500e-6] → 2*pi * [-666.7e-6, 666.7e-6]
```

#### Wave 3 — 二次审查遗漏修复

```
T10: 修复 sparse_recon_estimate 只搜索正 TDOA [quick]
  - coarse_candidates = (0:coarse_step_us:max_tdoa_us) → (-max_tdoa_us:coarse_step_us:max_tdoa_us)
  - tau_min_us = max(0, ...) → max(-max_tdoa_us, ...)

T11: 修复 DOA 估计 atand→atan2d + 方位角范围 [quick]
  - solve_doa_from_tdoa_pairs.m: atand 改为 atan2d
  - estimate_doa_from_phase.m: 方位角范围 [0,360) → [-180,180]

T12: 清理 src/ 下 4 个冗余独立实现文件 [quick]
  - 删除 min_cost_flow_unwrap.m (DP求解，非网络流)
  - 删除 quality_guided_unwrap.m (与methods/下重复)
  - 删除 select_path.m (路径选择工具)
  - 评估 sparse_recon_estimate.m 是否保留或合并

T13: 确认 method_quality_guided_v2 符号正确 [quick]
  - 验证 v2 已使用 +slope
  - 决定保留 v2 还是原版
```

#### Wave 4 — PEPU 合并

```
T9: 合并 8 个 PEPU 版本为唯一 method_pepu.m [deep]
  - 删除 method_pepu_v2.m, v2_final.m, v3.m, global.m, adaptive.m, enhanced.m, optimal.m, hybrid.m, improved_pepu.m
  - 重写 method_pepu.m，融合各版本闪光点：
    1. 全局粗搜：[-666.7, 666.7] μs 范围，1 μs 步进
    2. 局部精搜：粗搜最优点 ±2 μs，0.05 μs 步进
    3. 幅度加权：使用互谱幅度加权
    4. 不依赖 Itoh 预估计
    5. 符号统一：+slope / (2*pi) * 1e6
    6. 默认 freq_range：[8000, 12000]
    7. 近零保护 + 符号保留截断（吸收 v2_final）
```

#### Wave 5 — 工程改进

```
T14: 提取公共工具函数到 utils/ [quick]
  - 提取 itoh_unwrap, unwrap_given_tdoa
  - 删除各文件中的本地重复实现

T15: 修复 method_pepu.m find_best_start 越界 [quick]
  - 使用 floor(window_size/2) 确保整数索引
  - 修复循环边界

T16: 修复 normalize 命名冲突 [quick]
  - 将 normalize 函数重命名为 norm01
  - 避免与 MATLAB 工具箱冲突
```

#### Wave 6 — 最终验证

```
T17: 修复验证脚本 + 完整性检查 [unspecified-high]
  - 创建 verify_code_fixes.m
  - 覆盖所有 26 个问题的检查
  - 输出 PASS/FAIL 报告
```

### 自检断言

```matlab
% 断言 1：符号一致性
tau_signs = grep_all_files('tau_est = .*slope');
assert(all(tau_signs contain '+slope'), 'FAIL: 符号未统一');

% 断言 2：伪实现已删除
assert(~exist('method_min_cost_flow.m', 'file'), 'FAIL: 伪MCF未删除');
assert(~exist('method_least_squares.m', 'file'), 'FAIL: 伪LS未删除');

% 断言 3：PEPU 版本唯一
pepu_files = dir('method_pepu*.m');
assert(length(pepu_files) == 1 && pepu_files.name == 'method_pepu.m', 'FAIL: PEPU版本不唯一');

% 断言 4：参数一致性
freq_ranges = grep_all_files('freq_range = \[');
assert(all(freq_ranges == '[8000, 12000]'), 'FAIL: freq_range未统一');

% 断言 5：搜索范围对称
search_ranges = grep_all_files('linspace.*tau');
assert(all(search_ranges cover negative values), 'FAIL: 搜索范围不对称');

disp('Phase 0 自检通过');
```

### 输出物

- 修复后的 `matlab/src/methods/` 目录（仅保留有效方法）
- 统一的 `matlab/utils/` 公共工具函数
- 唯一 `method_pepu.m` 实现
- 验证脚本 `verify_code_fixes.m`

---

## 全局冻结参数（所有 Phase 共用）

```matlab
% === 写入 params_global.m，所有脚本 run 此文件后才能执行 ===

% 阵元坐标 [8×3]，列顺序：x, y, z（单位：m）
array_pos = [
  +0.500,  0.000,  0.000;   % d1 UCA
  +0.250, +0.433,  0.000;   % d2 UCA
  -0.250, +0.433,  0.000;   % d3 UCA
  -0.500,  0.000,  0.000;   % d4 UCA
  -0.250, -0.433,  0.000;   % d5 UCA
  +0.250, -0.433,  0.000;   % d6 UCA
   0.000,  0.000, +0.500;   % d7 顶部垂直元
   0.000,  0.000, -0.500;   % d8 底部垂直元
];

% 信号与采样
fs      = 64000;       % 采样率 (Hz)
T_obs   = 1.0;         % 观测时长 (s)
N       = fs * T_obs;  % 时域样点数 = 64000
N_FFT   = N;           % FFT 长度 = 64000（不零填充）
c       = 1500;        % 声速 (m/s)
f_min   = 8000;        % 分析频带下界 (Hz)
f_max   = 12000;       % 分析频带上界 (Hz)

% 频点计算（代码计算，禁止硬编码）
delta_f = fs / N_FFT;              % = 1 Hz
freq_vec = f_min:delta_f:f_max;    % 8000:1:12000
N_f     = length(freq_vec);        % 必须 = 4001

% 独立基线集：以 d1 为参考，共 7 条
ref_elem = 1;
ind_pairs = [(ones(7,1)), (2:8)'];  % [1,2],[1,3],...,[1,8]

% DOA 扫描范围
theta_range = [-180, 180]; % 方位角 (°)，步进 20°
phi_range   = [-80, 80];   % 俯仰角 (°)，步进 10°

% TDOA 搜索范围
d_max   = 1.0;           % m，最大基线
tau_max = d_max / c;     % 666.7 μs

% Monte Carlo 次数（场景级别覆盖）
N_MC_A  = 200;
N_MC_BC = 200;
N_MC_C  = 100;
N_MC_D  = 200;
```

---

## Phase 1 — 信号生成模块 + 相位模糊验证

### 任务描述

实现宽带信号生成、多阵元时延叠加、频域互谱计算，并定量验证最大相位缠绕圈数 = 8。

### MATLAB 实现要求

**文件**: `gen_signal.m`

```matlab
function Y = gen_signal(theta_deg, phi_deg, tau_us, SNR_dB, params, mode)
% 生成 8 阵元接收信号（频域）
%
% 输入：
%   theta_deg  - 声源方位角 (°)
%   phi_deg    - 声源俯仰角 (°)
%   tau_us     - 主路径基础时延 (μs)，单径模式下不使用
%   SNR_dB     - 信噪比 (dB)
%   params     - 全局参数结构体（由 params_global.m 生成）
%   mode       - 'single' | 'colored' | 'multipath'
%
% 输出：
%   Y          - [8 × N_FFT] 复数频域信号矩阵
%
% 实现步骤：
%   1. 生成宽带线性调频（LFM）或白噪声激励信号 s(t)，长度 N
%   2. 计算每个阵元的到达时延 tau_i = d_i^T * u_hat / c
%      u_hat = [cos(phi)*cos(theta); cos(phi)*sin(theta); sin(phi)]
%   3. 时域施加时延（频域乘以 exp(+j*2*pi*f*tau_i)）
%   4. 加入噪声（白噪声 or AR(2) 有色噪声，按 mode）
%   5. FFT，截取 [f_min, f_max] 频点
%   6. 返回 Y [8 × N_f] 复数矩阵（仅保留分析频带）
```

**文件**: `compute_cross_spectrum.m`

```matlab
function G = compute_cross_spectrum(Y, pair_list)
% 计算阵元对互功率谱
%   G(k, f) = Y_i(f) * conj(Y_j(f))，对应 pair_list(k,:)=[i,j]
% 输出：G [N_pairs × N_f] 复数矩阵
```

**文件**: `verify_phase_ambiguity.m`（验证脚本）

```matlab
% 验证最大相位缠绕圈数 = 8
% 对最长基线 (d=1.0 m)，theta=90°（端射），计算 N_wrap
d_max    = 1.0;
tau_max  = d_max / c;                    % 666.7 μs
N_wrap   = f_max * tau_max;              % 应 = 8.0

% 画出真实相位（解卷绕）和包裹相位
phi_true    = 2 * pi * freq_vec * tau_max;
phi_wrapped = angle(exp(1j * phi_true));

figure;
plot(freq_vec/1e3, phi_true/(2*pi), 'b', 'DisplayName','真实相位（圈数）');
hold on;
plot(freq_vec/1e3, phi_wrapped/(2*pi), 'r--', 'DisplayName','包裹相位（圈数）');
xlabel('频率 (kHz)'); ylabel('相位（圈数）');
title(sprintf('最长基线相位模糊验证：N_{wrap} = %.1f', N_wrap));
legend; grid on;
```

### 自检断言

```matlab
% 断言 1：频点数必须 = 4001
assert(N_f == 4001, 'FAIL: N_f 不等于 4001，检查 freq_vec 定义');

% 断言 2：最大缠绕圈数必须在 [7.9, 8.1]
assert(abs(N_wrap - 8.0) < 0.1, 'FAIL: N_wrap 计算异常');

% 断言 3：单径退化验证 — L=1 时互谱相位必须接近线性
% 生成 theta=0, phi=0, SNR=40dB 的单径信号
Y_test = gen_signal(0, 0, 0, 40, params, 'single');
G_test = compute_cross_spectrum(Y_test, [1,2]);
phi_test = unwrap(angle(G_test));
% 对相位做线性拟合，残差应 < 0.1 rad RMS
p = polyfit(freq_vec', phi_test(:), 1);
residual_rms = rms(phi_test(:) - polyval(p, freq_vec'));
assert(residual_rms < 0.1, sprintf('FAIL: 单径退化验证失败，相位非线性 RMS=%.4f rad', residual_rms));

disp('Phase 1 自检通过');
```

### 输出物

- `gen_signal.m`
- `compute_cross_spectrum.m`
- `verify_phase_ambiguity.m`
- 图: `fig_phase_ambiguity.png`（展示 8 圈模糊，对应正文 Fig.2）

---

## Phase 2 — 单径工作型 CRLB 函数实现

### 任务描述

实现 TDOA CRLB 与 DOA CRLB（误差传播法），频点由代码计算，禁止硬编码。

### MATLAB 实现要求

**文件**: `compute_crlb.m`

```matlab
function [crlb_tau_us, crlb_doa_deg] = compute_crlb(snr_db, theta_deg, phi_deg, params)
% 单径工作型 TDOA CRLB + DOA 下界
%
% TDOA CRLB 公式：
%   sigma_tau = 1 / (2*pi * sqrt(SNR * N_f * mean_f2))
%   其中 mean_f2 = mean(freq_vec.^2)，由代码计算
%
% DOA 下界（误差传播）：
%   C_doa = inv(J' * inv(C_tau) * J)
%   其中 J 为独立基线集的雅可比矩阵，C_tau = diag(sigma_tau^2, ...)
%
% 输出：
%   crlb_tau_us   - TDOA CRLB (μs)
%   crlb_doa_deg  - [sigma_theta, sigma_phi] (°)，独立基线集误差传播结果

% Step 1：计算均方频率（代码计算，不手工硬编码）
mean_f2 = mean(params.freq_vec .^ 2);

% Step 2：TDOA CRLB
SNR_linear  = 10^(snr_db / 10);
sigma_tau   = 1 / (2 * pi * sqrt(SNR_linear * params.N_f * mean_f2));
crlb_tau_us = sigma_tau * 1e6;

% Step 3：DOA 下界（雅可比矩阵）
% u_hat = [cos(phi)*cos(theta); cos(phi)*sin(theta); sin(phi)]
% tau_ij(theta,phi) = (d_i - d_j)' * u_hat / c
% J = d(tau)/d([theta,phi])，数值雅可比或解析雅可比
% ...（完整实现见文件）
end
```

**文件**: `compute_jacobian.m`

```matlab
function J = compute_jacobian(theta_deg, phi_deg, pair_list, array_pos, c)
% 计算独立基线集 TDOA 对 [theta, phi] 的雅可比矩阵
% 输出：J [N_pairs × 2]，单位：s/rad（后续转换）
% 使用解析公式：
%   d(tau_ij)/d(theta) = (d_i-d_j)' * d(u_hat)/d(theta) / c
%   d(tau_ij)/d(phi)   = (d_i-d_j)' * d(u_hat)/d(phi)   / c
```

### 自检断言

```matlab
% 断言 1：mean_f2 合理性（8~12 kHz 均方频率应在 [8e3^2, 12e3^2] 内）
assert(mean_f2 > 8e3^2 && mean_f2 < 12e3^2, 'FAIL: mean_f2 范围异常');

% 断言 2：高 SNR 下 CRLB 应极小（SNR=40dB，crlb_tau < 0.1 μs）
[crlb_t, ~] = compute_crlb(40, 0, 0, params);
assert(crlb_t < 0.1, sprintf('FAIL: 高SNR CRLB异常大：%.4f μs', crlb_t));

% 断言 3：低 SNR 下 CRLB 应增大（SNR=-20dB > SNR=0dB）
[crlb_low,  ~] = compute_crlb(-20, 0, 0, params);
[crlb_high, ~] = compute_crlb(0,   0, 0, params);
assert(crlb_low > crlb_high, 'FAIL: CRLB 不随 SNR 单调');

% 断言 4：雅可比矩阵无奇异（theta 不接近 ±90°）
J_test = compute_jacobian(0, 0, params.ind_pairs, params.array_pos, params.c);
assert(rank(J_test) == 2, 'FAIL: 雅可比矩阵在 theta=0 时奇异');

disp('Phase 2 自检通过');
```

### 输出物

- `compute_crlb.m`
- `compute_jacobian.m`
- 验证图：`fig_crlb_vs_snr.png`（SNR -20~40 dB 的 CRLB 曲线）

---

## Phase 3 — GCC-PHAT 基线实现

### 任务描述

实现标准 GCC-PHAT（不私自改造），用于 Layer 2 TDOA 估计基线。

### MATLAB 实现要求

**文件**: `gcc_phat.m`

```matlab
function [tau_est_us, tdoa_metrics] = gcc_phat(Y, pair_list, params)
% 标准 GCC-PHAT TDOA 估计
%
% 算法：
%   1. 计算互功率谱 G_ij(f) = Y_i(f) * conj(Y_j(f))
%   2. PHAT 加权：G_phat = G_ij / |G_ij|
%   3. IFFT 得广义互相关函数 R_phat(tau)
%   4. 在 tau ∈ [-tau_max, +tau_max] 内搜索峰值
%   5. 插值精化（抛物线插值）
%   6. 转换为 μs
%
% 约束：
%   - 使用标准实现，不添加任何先验约束
%   - 峰值搜索范围限制在物理可行域内：|tau| ≤ d_max/c
%
% 输出：
%   tau_est_us    - TDOA 估计 [N_pairs × 1]，单位 μs
%   tdoa_metrics  - struct: rmse, bias, std, success_rate, gross_error_rate, crlb_gap
```

### 自检断言

```matlab
% 断言：已知 TDOA 下，GCC-PHAT 在 SNR=20dB 时误差 < 5 μs
tau_true_us = 50;
Y_test = gen_signal_with_tdoa(tau_true_us, 20, params);  % 辅助函数
[tau_est, ~] = gcc_phat(Y_test, [1,2], params);
err = abs(tau_est - tau_true_us);
assert(err < 5, sprintf('FAIL: GCC-PHAT SNR=20dB 误差过大：%.2f μs', err));

disp('Phase 3 自检通过');
```

### 输出物

- `gcc_phat.m`
- 验证图：`fig_gcc_phat_validation.png`（已知 TDOA，SNR 扫描，GCC-PHAT 误差曲线）

---

## Phase 4 — PEPU 实现

### 任务描述

基于 Phase 0 修复后的唯一 `method_pepu.m`，实现 PEPU 方法（基于互谱包裹相位的相位解卷绕 + TDOA 估计），遵循冻结接口规范。

### MATLAB 实现要求

**文件**: `pepu_unwrap.m`（Layer 1 接口）

```matlab
function [phi_unwrapped, phase_metrics] = pepu_unwrap(phi_wrapped, params)
% PEPU 前端相位解卷绕
%
% 输入：
%   phi_wrapped    - 包裹相位 [N_pairs × N_f]，来自互功率谱 angle(G_ij)
%   params         - 全局参数（含 freq_vec, N_f, K, lambda 等）
%
% 输出：
%   phi_unwrapped  - 解卷绕相位 [N_pairs × N_f]
%   phase_metrics  - struct:
%                    .rmse              (rad)
%                    .bias              (rad)
%                    .continuity_score  (0~1，按附录A定义)
%                    .success_rate      (%)
%                    .gross_error_rate  (%)
%
% 核心算法（基于修复后的 method_pepu.m）：
%   Step 1: 全局粗搜
%     在 [-666.7, 666.7] μs 范围内，以 1 μs 步进
%     计算每个候选 TDOA 的加权线性残差
%
%   Step 2: 局部精搜
%     在粗搜最优点的 ±2 μs 范围内，以 0.05 μs 步进
%
%   Step 3: 幅度加权（如果 params.amplitude 可用）
%     使用互谱幅度加权
%
%   Step 4: 时延估计
%     slope = polyfit(freq, unwrapped_phase, 1)
%     tau_est = slope / (2*pi) * 1e6  (μs)
%
% 关键参数：
%   K - 延拓阶数（默认3，自适应模式根据粗估计TDOA调整）
%   threshold - 相位跳变阈值（默认π）
```

**文件**: `pepu_tdoa.m`（Layer 2 接口）

```matlab
function [tau_est_us, tdoa_metrics] = pepu_tdoa(phi_unwrapped, params)
% 从解卷绕相位估计 TDOA
%   tau_est = slope / (2*pi)，通过最小二乘线性拟合 phi vs freq 得到
%
% 输出：
%   tau_est_us    - TDOA 估计 [N_pairs × 1]，单位 μs
%   tdoa_metrics  - struct（同 gcc_phat 输出结构）
```

**文件**: `compute_phase_continuity.m`（附录 A 实现）

```matlab
function C = compute_phase_continuity(phi_unwrapped)
% 计算二阶差分连续性分数（附录 A 严格定义）
%   delta2_phi = phi(k+1) - 2*phi(k) + phi(k-1)
%   C = exp(-var(delta2_phi) / (2*pi*delta_f)^2)
%   C ∈ [0,1]，完美线性相位 → C=1
```

### 自检断言

```matlab
% 断言 1：完美线性相位的 continuity_score 应 = 1
phi_linear = 2 * pi * freq_vec * 50e-6;  % tau=50μs
phi_wrapped_test = angle(exp(1j * phi_linear));
[phi_uw, metrics] = pepu_unwrap(phi_wrapped_test, params);
assert(metrics.continuity_score > 0.99, 'FAIL: 线性相位连续性分数不接近 1');

% 断言 2：高 SNR 下 PEPU TDOA 误差 < GCC-PHAT（Scene A 主要断言，此处用代理验证）
tau_true_us = 50;
Y_test = gen_signal(0, 0, tau_true_us, 30, params, 'single');
G_test = compute_cross_spectrum(Y_test, [1,2]);
phi_w  = angle(G_test);
[~, pm] = pepu_unwrap(phi_w, params);
assert(pm.success_rate > 95, sprintf('FAIL: PEPU SNR=30dB 成功率 %.1f%% < 95%%', pm.success_rate));

% 断言 3：8 圈模糊场景（最长基线，高 SNR）PEPU 应成功解卷绕
% Itoh 应失败（另写 itoh_unwrap.m 后验证）

disp('Phase 4 自检通过');
```

### 输出物

- `pepu_unwrap.m`（基于修复后的 method_pepu.m）
- `pepu_tdoa.m`
- `compute_phase_continuity.m`
- 验证图：`fig_pepu_unwrap_demo.png`（真值/包裹/PEPU恢复三线对比，对应正文 Fig.2）

---

## Phase 5 — 全部 8 种对比方法相位解卷绕实现

### 任务描述

实现 Layer 1 的 **8 种对比方法**，均遵循统一接口。**注意：删除伪实现后，需要重新规划方法列表。**

### 方法列表（修复后）

| 类别     | 方法              | 简称 | 实现状态              |
| -------- | ----------------- | ---- | --------------------- |
| 局部方法 | Itoh逐点法        | Itoh | 修复后可用            |
| 局部方法 | 质量引导法        | QG   | v2 已修复，删除原版   |
| 全局方法 | 分支切割法        | BC   | 需新实现              |
| 全局方法 | 最小二乘法（DCT） | LS   | method_dct_unwrap.m   |
| 全局方法 | 最小费用流        | MCF  | 需新实现（网络流）    |
| 优化方法 | 迭代余弦变换法    | ICT  | 需新实现              |
| 优化方法 | 稀疏重构法        | SR   | method_sparse_recon.m |
| 估计方法 | 扩展卡尔曼滤波    | EKF  | 需新实现              |
| **本文** | PEPU              | PEPU | Phase 4 已实现        |

**删除的伪实现**：

- ~~method_min_cost_flow.m~~ → 需要实现真正的 MCF
- ~~method_least_squares.m~~ → 使用 method_dct_unwrap.m

### MATLAB 实现要求

**文件**: `itoh_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = itoh_unwrap(phi_wrapped, params)
% Itoh 局部差分相位解卷绕
% 算法：phi(k) = phi(k-1) + wrap(phi_wrapped(k) - phi_wrapped(k-1))
% 预期：在本系统（8圈模糊）直接失效
% 接口与 pepu_unwrap 完全相同
```

**文件**: `qg_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = qg_unwrap(phi_wrapped, params)
% Quality-Guided 质量引导法
% 基于修复后的 method_quality_guided_v2.m
% 算法步骤：
%   1. 计算相位质量图（相位导数方差）
%   2. 从高质量种子点开始解卷绕
%   3. 按质量排序逐步扩展
% 输入：phi_wrapped [N_pairs × N_f]
% 输出：phi_unwrapped [N_pairs × N_f]
```

**文件**: `bc_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = bc_unwrap(phi_wrapped, params)
% Branch-Cut 分支切割法
% 算法步骤：
%   1. 检测残差点（奇异点）
%   2. 连接正负残差点形成分支切割线
%   3. 在切割线约束下路径无关解卷绕
% 需要共享模块：detect_residues()
```

**文件**: `ls_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = ls_unwrap(phi_wrapped, params)
% Least-Squares 最小二乘全局相位解卷绕
% 基于修复后的 method_dct_unwrap.m
% 算法：min_φ ∫∫ |∇φ - ∇φ_wrapped|² dA
% 求解方法：FFT 求解泊松方程
% 需要共享模块：poisson_fft()
```

**文件**: `mcf_unwrap.m`（需新实现）

```matlab
function [phi_unwrapped, phase_metrics] = mcf_unwrap(phi_wrapped, params)
% Min-Cost Flow 最小费用流法（真正的网络流实现）
% 算法步骤：
%   1. 构建网络流图（残差点为供需节点）
%   2. 求解最小费用流（使用 MATLAB graph 函数或第三方库）
%   3. 根据流结果修正相位
% 需要共享模块：min_cost_flow(), detect_residues()
```

**文件**: `ict_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = ict_unwrap(phi_wrapped, params)
% Iterative Cosine Transform 迭代余弦变换法
% 算法步骤：
%   1. 计算包裹相位梯度
%   2. 余弦变换求解泊松方程
%   3. 检测并修正边界跳变
%   4. 迭代直到收敛
% 参数：max_iter, tol
```

**文件**: `sr_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = sr_unwrap(phi_wrapped, params)
% Sparse Reconstruction 稀疏恢复相位解卷绕
% 基于修复后的 method_sparse_recon.m
% 算法：min_φ ||Aφ - y||₂² + λ||∇φ||₁
% 求解方法：FISTA 或 ADMM
% 参数：lambda (正则化参数), max_iter
```

**文件**: `ekf_unwrap.m`

```matlab
function [phi_unwrapped, phase_metrics] = ekf_unwrap(phi_wrapped, params)
% Extended Kalman Filter 扩展卡尔曼滤波法
% 状态模型：
%   x_k = F·x_{k-1} + w_k    (状态方程)
%   z_k = h(x_k) + v_k       (观测方程)
% 状态向量：[phase, phase_rate]
% 参数：Q (过程噪声), R (观测噪声)
```

### 共享模块

**文件**: `shared/wrap_to_pi.m`

```matlab
function y = wrap_to_pi(x)
% 将角度包裹到 [-π, π]
y = mod(x + pi, 2*pi) - pi;
```

**文件**: `shared/compute_quality_map.m`

```matlab
function Q = compute_quality_map(phase)
% 计算相位导数方差质量图
% 输入：phase [M × N]
% 输出：Q [M × N]，值越大质量越高
end
```

**文件**: `shared/detect_residues.m`

```matlab
function residues = detect_residues(phase)
% 检测残差点（奇异点）
% 输出：residues [M-1 × N-1]，值为 -1/0/1
end
```

**文件**: `shared/poisson_fft.m`

```matlab
function phi = poisson_fft(rhs)
% FFT 求解泊松方程 ∇²φ = rhs
end
```

**文件**: `shared/min_cost_flow.m`（需新实现）

```matlab
function [flow, cost] = min_cost_flow(n_nodes, edges, supply)
% 求解最小费用流（真正的网络流算法）
% edges: [from, to, capacity, cost]
% 使用 MATLAB graph 函数或第三方库
end
```

**文件**: `shared/soft_threshold.m`

```matlab
function y = soft_threshold(x, lambda)
% 软阈值收缩算子
y = sign(x) .* max(abs(x) - lambda, 0);
end
```

### 自检断言

```matlab
% 断言 1：Itoh 在 8 圈模糊下必须失败（success_rate < 50%）
Y_test = gen_signal(90, 0, 0, 20, params, 'single');
G_test = compute_cross_spectrum(Y_test, [1,4]);  % 最长基线 d1-d4
phi_w  = angle(G_test);
[~, itoh_m] = itoh_unwrap(phi_w, params);
assert(itoh_m.success_rate < 50, ...
    sprintf('WARN: Itoh 在 8圈模糊下成功率 %.1f%% 意外过高', itoh_m.success_rate));

% 断言 2：LS 在高 SNR 下应接近真值（SNR=30dB，rmse < 0.5 rad）
[phi_ls, ls_m] = ls_unwrap(phi_w, params);
assert(ls_m.rmse < 0.5, sprintf('FAIL: LS 高SNR rmse=%.4f rad 过大', ls_m.rmse));

% 断言 3：SR 在中 SNR 下应优于 Itoh（SNR=10dB）
Y_mid = gen_signal(0, 0, 50, 10, params, 'single');
G_mid = compute_cross_spectrum(Y_mid, [1,2]);
phi_mid = angle(G_mid);
[~, sr_m] = sr_unwrap(phi_mid, params);
[~, itoh_m2] = itoh_unwrap(phi_mid, params);
assert(sr_m.success_rate > itoh_m2.success_rate, 'FAIL: SR 应优于 Itoh');

disp('Phase 5 自检通过');
```

### 输出物

- `itoh_unwrap.m`, `qg_unwrap.m`, `bc_unwrap.m`
- `ls_unwrap.m` (基于 method_dct_unwrap.m), `mcf_unwrap.m` (新实现), `ict_unwrap.m`
- `sr_unwrap.m` (基于修复后的 method_sparse_recon.m), `ekf_unwrap.m`
- 共享模块：`shared/wrap_to_pi.m`, `shared/compute_quality_map.m`, `shared/detect_residues.m`, `shared/poisson_fft.m`, `shared/min_cost_flow.m`, `shared/soft_threshold.m`
- Itoh 失效验证图：`fig_itoh_failure.png`
- 方法对比验证图：`fig_methods_comparison.png`

---

## Phase 6 — 普通 LS DOA 后端实现

### 任务描述

实现正文统一 DOA 后端（普通 LS），参数 backend='LS'；补充材料用 Huber，接口统一。

### MATLAB 实现要求

**文件**: `estimate_doa.m`

```matlab
function [doa_est_deg, doa_metrics] = estimate_doa(tau_est_us, tau_true_us, ...
                                                     theta_true, phi_true, ...
                                                     array_pos, pair_list, params)
% DOA LS 估计（正文固定 backend='LS'）
%
% 优化目标：
%   min_{theta,phi} || tau_est - tau_model(theta,phi) ||_2^2
%   其中 tau_model(theta,phi) = (d_i - d_j)^T * u_hat / c
%
% 搜索策略：
%   1. 粗搜索：网格搜索，theta ∈ [-180°,180°]，phi ∈ [-80°,80°]，步进 1°
%   2. 精搜索：fminsearch 在粗搜索最优点附近精化
%
% 输出：
%   doa_est_deg  - [theta_est, phi_est]（°）
%   doa_metrics  - struct:
%                  .azimuth_rmse_deg
%                  .elevation_rmse_deg
%                  .azimuth_bias_deg
%                  .elevation_bias_deg
%                  .doa_success_rate   （方位+俯仰误差均 < 2°）
%                  .doa_gross_error_rate（任一 > 5°）
%                  .doa_crlb_gap       （dB）
```

**文件**: `estimate_doa_huber.m`（补充材料用，接口相同）

```matlab
% 仅用于补充实验，必须对所有方法统一使用
% 需额外输出：weights_final, n_outlier_pairs, pair_weight_histogram
```

### 自检断言

```matlab
% 断言：已知 TDOA（无误差）下，LS DOA 应精确恢复真值
tau_perfect = compute_true_tdoa(30, 15, params);  % theta=30°, phi=15°
[doa_est, ~] = estimate_doa(tau_perfect, tau_perfect, 30, 15, ...
                              params.array_pos, params.ind_pairs, params);
err_az = abs(doa_est(1) - 30);
err_el = abs(doa_est(2) - 15);
assert(err_az < 0.1 && err_el < 0.1, ...
    sprintf('FAIL: 无噪 LS DOA 误差过大：az=%.3f°, el=%.3f°', err_az, err_el));

disp('Phase 6 自检通过');
```

### 输出物

- `estimate_doa.m`
- `estimate_doa_huber.m`
- `compute_true_tdoa.m`（辅助函数）

---

## Phase 7 — Scene A 全量实验

### 任务描述

单径理想基线场景，三层全量 Monte Carlo，与单径 CRLB 对齐。

### 参数配置

```matlab
% Scene A 参数（冻结）
snr_vec     = -20:2:40;          % 31 点
tdoa_cases  = [10, 50, 100, 200]; % μs，4 种
theta_cases = -180:20:180;       % 19 种方位角
phi_cases   = -80:10:80;         % 17 种俯仰角
N_MC        = 200;
% 总仿真量 = 31 × 4 × 19 × 17 × 200 = 8,023,200 次
```

### MATLAB 实现要求

**文件**: `run_scene_A.m`

```matlab
% Scene A 主循环（伪代码结构，实现时展开）
for i_snr = 1:length(snr_vec)
  for i_tdoa = 1:length(tdoa_cases)
    for i_theta = 1:length(theta_cases)
      % 初始化累积变量
      for i_mc = 1:N_MC
        % 1. 生成信号
        Y = gen_signal(theta_cases(i_theta), phi_fixed, ...
                       tdoa_cases(i_tdoa), snr_vec(i_snr), params, 'single');
        % 2. 计算互谱包裹相位
        G = compute_cross_spectrum(Y, params.ind_pairs);
        phi_wrapped = angle(G);

        % 3. 各方法 Layer 1（共 9 种：8 种对比 + 1 种本文）
        [phi_itoh, ~] = itoh_unwrap(phi_wrapped, params);
        [phi_qg,   ~] = qg_unwrap(phi_wrapped, params);
        [phi_bc,   ~] = bc_unwrap(phi_wrapped, params);
        [phi_ls,   ~] = ls_unwrap(phi_wrapped, params);
        [phi_mcf,  ~] = mcf_unwrap(phi_wrapped, params);
        [phi_ict,  ~] = ict_unwrap(phi_wrapped, params);
        [phi_sr,   ~] = sr_unwrap(phi_wrapped, params);
        [phi_ekf,  ~] = ekf_unwrap(phi_wrapped, params);
        [phi_pepu, ~] = pepu_unwrap(phi_wrapped, params);

        % 4. 各方法 Layer 2 TDOA 估计
        [tau_gcc,  ~] = gcc_phat(Y, params.ind_pairs, params);
        [tau_pepu, ~] = pepu_tdoa(phi_pepu, params);

        % 5. Layer 3 DOA（统一 LS 后端）
        [doa_gcc,  ~] = estimate_doa(tau_gcc,  ...);
        [doa_pepu, ~] = estimate_doa(tau_pepu, ...);

        % 6. 记录结果
        % 记录 9 种方法的 phase_metrics 和 tdoa_metrics
        % ...
      end
      % 计算统计量（均值/std/成功率/gross_error_rate/crlb_gap）
      % 保存到 results_A 结构体
    end
  end
end
% 保存：save('results_scene_A.mat', 'results_A')
```

### 自检断言（Scene A 完成后）

```matlab
% 断言 1：PEPU 在 SNR≥0dB 时 tdoa_crlb_gap < GCC-PHAT 的 tdoa_crlb_gap
for i_snr = find(snr_vec >= 0)
  gap_pepu = results_A.tdoa_crlb_gap.pepu(i_snr, :, :);
  gap_gcc  = results_A.tdoa_crlb_gap.gcc(i_snr,  :, :);
  assert(mean(gap_pepu(:)) < mean(gap_gcc(:)), ...
      sprintf('FAIL: Scene A SNR=%.0fdB，PEPU crlb_gap 不优于 GCC-PHAT', snr_vec(i_snr)));
end

% 断言 2：Itoh 在 8 圈模糊条件下（最长基线）成功率 < 50%
% 此处用 tdoa=200μs（最大 TDOA ≈ 200μs 对应约 3 圈模糊，可行域内调整）

% 断言 3：结果文件存在
assert(exist('results_scene_A.mat', 'file') == 2, 'FAIL: Scene A 结果文件未生成');

disp('Phase 7 自检通过');
```

### 输出物

- `run_scene_A.m`
- `results_scene_A.mat`
- 图（对应正文）：
  - `fig3_tdoa_rmse_vs_snr.png`（TDOA RMSE + CRLB，对应正文 Fig.3）
  - `fig5_snr_tdoa_heatmap.png`（SNR × TDOA 热力图，对应正文 Fig.5）

---

## Phase 8 — Scene B / C / D 实验

### Scene B：单径 + 有色噪声

**文件**: `run_scene_B.m`

```matlab
% 噪声类型：AR(2) 有色噪声
% 斜率：0 / -3 / -6 / -10 dB/oct
% SNR：-20~+20 dB，TDOA 固定 50μs，N_MC=200
% 输出：TDOA RMSE vs 噪声谱斜率，DOA RMSE vs 噪声谱斜率

% AR(2) 有色噪声生成：
%   a = [1, -ar_coeff1, -ar_coeff2]（按斜率确定系数）
%   noise = filter(1, a, randn(N, 8))

% 自检：有色噪声功率谱斜率应符合设定（验证 AR 系数）
```

### Scene C：参数化多径场景

**文件**: `run_scene_C.m`

```matlab
% 扫描：L × 幅度比 × 时延差 × SNR = 4×4×4×4 = 256 组合
% 每组 N_MC=100，总量 25,600 次
%
% 多径模型：
%   y_i(t) = sum_l a_l * s(t - tau_l - d_i^T * u_l / c) + noise
%   每条路径有独立方向向量 u_l（禁止共用同一 u_hat）
%
% 核心输出：
%   - SNR × 多径严重度 热力图（tdoa_rmse）→ 正文 Fig.6
%   - 成功/失败相位恢复案例图          → 正文 Fig.7
%
% 自检：L=1 时必须退化为单径，与 Scene A 对应点一致（误差 < 5%）
```

### Scene D：TDOA–DOA 完整级联场景

**文件**: `run_scene_D.m`

```matlab
% 完整 8 元立体阵，统一 LS DOA 后端
% 信道：单径 + 多径（L=2，幅度比 -6dB）
% SNR：-10~+30 dB
% DOA 真值网格：theta = -180:60:180 (7点), phi = -60:30:60 (5点), 共 35 点
% N_MC = 200
%
% 必须同时输出：
%   tdoa_rmse_us, doa_rmse_deg, tdoa_crlb_gap, doa_crlb_gap
%
% 统计检验（关键场景）：
%   - 配对 t 检验：PEPU vs GCC-PHAT（TDOA 和 DOA）
%   - Bootstrap 95% 置信区间（SNR=0dB 代表点）
%
% 自检：
%   assert(pepu_doa_crlb_gap < gcc_doa_crlb_gap, 'FAIL: Scene D 退出条件未满足')
%   assert(pepu_gross_error_rate_C < 0.5 * gcc_gross_error_rate_C, 'FAIL: 辅助条件未满足')
```

### 显著性检验（Scene A 和 Scene D）

**文件**: `run_significance_tests.m`

```matlab
% 配对 t 检验
[h, p] = ttest(pepu_tdoa_errors, gcc_tdoa_errors);
fprintf('TDOA 配对t检验: h=%d, p=%.4f\n', h, p);

% Wilcoxon 秩和检验（备选）
p_wil = ranksum(pepu_tdoa_errors, gcc_tdoa_errors);

% Bootstrap 95% CI（SNR=0dB）
n_boot = 1000;
boot_means = bootstrp(n_boot, @mean, pepu_tdoa_errors_0dB);
ci = prctile(boot_means, [2.5, 97.5]);
fprintf('PEPU TDOA Bootstrap 95%% CI: [%.3f, %.3f] μs\n', ci(1), ci(2));
```

### 失效边界记录（必须，不可隐藏）

**文件**: `record_failure_boundaries.m`

```matlab
% 记录 PEPU tdoa_crlb_gap > 6dB 的 SNR 阈值
snr_fail_threshold = snr_vec(find(pepu_crlb_gap > 6, 1, 'first'));
fprintf('PEPU tdoa_crlb_gap > 6dB 的 SNR 阈值：%.0f dB\n', snr_fail_threshold);

% 记录 doa_gross_error_rate > 5% 的多径严重度阈值
% ...

% 保存到论文补充材料数据
save('failure_boundaries.mat', 'snr_fail_threshold', ...);
```

### 输出物

- `run_scene_B.m`, `run_scene_C.m`, `run_scene_D.m`
- `run_significance_tests.m`, `record_failure_boundaries.m`
- `results_scene_B.mat`, `results_scene_C.mat`, `results_scene_D.mat`
- 图：`fig4_doa_rmse_vs_snr.png`（Fig.4）、`fig6_multipath_heatmap.png`（Fig.6）
- 图：`fig7_phase_recovery_cases.png`（Fig.7）、`fig8_cascade_performance.png`（Fig.8）

---

## Phase 9 — 结果分析与图表生成

### 任务描述

统一生成正文 8 张图 + 补充材料图，格式标准化。

### MATLAB 实现要求

**文件**: `plot_all_figures.m`

```matlab
% 图表规范：
%   - 字体：Times New Roman 或 Helvetica，10pt
%   - 坐标轴标签：英文（论文语言）
%   - 线型：PEPU=实线红色，GCC-PHAT=虚线蓝色，CRLB=点线黑色
%   - 误差棒：基于 Monte Carlo 标准差
%   - 分辨率：300 dpi
%   - 格式：.png + .eps（双格式）

% Fig.1：阵列几何 3D 示意图
%   plot3 阵元位置，标注独立基线集（d1-d2 至 d1-d8）

% Fig.2：相位包裹示意（真值/包裹/PEPU恢复）
%   来自 Phase 1 verify_phase_ambiguity.m 的数据

% Fig.3：TDOA RMSE vs SNR（带 CRLB）
% Fig.4：方位角/俯仰角 RMSE vs SNR
% Fig.5：SNR × TDOA 热力图
% Fig.6：SNR × 多径严重度 热力图
% Fig.7：相位恢复成功/失败对比图
% Fig.8：TDOA→DOA 级联性能图
```

### 自检断言

```matlab
% 断言：所有 8 张正文图文件均存在
fig_files = {'fig1_array_geom', 'fig2_phase_ambiguity', 'fig3_tdoa_rmse', ...
             'fig4_doa_rmse', 'fig5_tdoa_heatmap', 'fig6_multipath_heatmap', ...
             'fig7_phase_recovery', 'fig8_cascade'};
for i = 1:length(fig_files)
  assert(exist([fig_files{i} '.png'], 'file') == 2, ...
         ['FAIL: 正文图未生成：' fig_files{i}]);
end
disp('Phase 9 自检通过');
```

### 输出物

- `plot_all_figures.m`
- 正文 8 张图（.png + .eps 各一份）
- 补充图（9方法完整对比、28对融合、Huber结果、Bootstrap分布、频域降采样）

---

## Phase 10 — 数据存档与复现验证

### 任务描述

确保所有结果可复现，整理最终数据包。

### MATLAB 实现要求

**文件**: `run_full_pipeline.m`（一键复现脚本）

```matlab
% 一键运行脚本，供审稿人复现
clear; clc;
params_global;          % 加载全局参数
run_scene_A;            % ~223,200 次仿真
run_scene_B;
run_scene_C;            % ~25,600 次仿真
run_scene_D;
run_significance_tests;
record_failure_boundaries;
plot_all_figures;
fprintf('全流程完成。所有结果保存在当前目录。\n');
```

**文件**: `verify_reproducibility.m`

```matlab
% 加载已有结果，重跑关键点（5%抽样），检查一致性
% 断言：关键指标偏差 < 1%（由随机种子控制）
rng(42);  % 固定随机种子（所有仿真文件开头均需加此行）
```

### 最终自检清单

```matlab
% 逐项核查
checks = {
  'params_global.m 存在且 N_f==4001',        N_f == 4001;
  'CRLB 函数 mean_f2 由代码计算',             true;  % 人工审查
  'GCC-PHAT 为标准实现',                      true;  % 人工审查
  '多径模型每条路径有独立 u_hat',              true;  % 人工审查
  'DOA 后端正文固定为 LS',                    true;  % 人工审查
  'Huber 后端所有方法统一使用',               true;  % 补充材料
  '失效边界已记录',       exist('failure_boundaries.mat','file')==2;
  '随机种子 rng(42) 全程固定',               true;  % 人工审查
  '正文 8 张图全部生成',                      all_figs_exist;
  'Scene A 退出条件满足（PEPU gap < GCC gap）', exit_cond_A;
  'Scene C 辅助条件满足（gross error < 50%）', exit_cond_C;
  '全部 9 种方法已实现',                      true;  % 人工审查：Itoh,QG,BC,LS,MCF,ICT,SR,EKF,PEPU
  '共享模块已实现',                           true;  % 人工审查：wrap_to_pi,quality_map,residues,poisson_fft,min_cost_flow,soft_threshold
};

for i = 1:size(checks,1)
  status = checks{i,2};
  if status
    fprintf('[PASS] %s\n', checks{i,1});
  else
    fprintf('[FAIL] %s\n', checks{i,1});
  end
end
```

### 输出物

- `run_full_pipeline.m`
- `verify_reproducibility.m`
- `README_reproduce.md`（说明复现步骤、MATLAB 版本要求、运行时间估计）
- 最终数据包（所有 `.mat` + 图文件）

---

## 文件结构总览

```
PEPU_experiment/
├── params_global.m              % 全局参数（所有脚本必须先运行此文件）
│
├── signal/
│   ├── gen_signal.m
│   ├── compute_cross_spectrum.m
│   └── compute_true_tdoa.m
│
├── layer1_unwrap/               % 9 种方法（8 种对比 + 1 种本文）
│   ├── itoh_unwrap.m            % 局部方法 - Itoh
│   ├── qg_unwrap.m              % 局部方法 - Quality-Guided (基于修复后的 v2)
│   ├── bc_unwrap.m              % 全局方法 - Branch-Cut
│   ├── ls_unwrap.m              % 全局方法 - Least-Squares (基于 method_dct_unwrap.m)
│   ├── mcf_unwrap.m             % 全局方法 - Min-Cost Flow (新实现)
│   ├── ict_unwrap.m             % 优化方法 - Iterative Cosine Transform
│   ├── sr_unwrap.m              % 优化方法 - Sparse Reconstruction (基于修复后的 method_sparse_recon.m)
│   ├── ekf_unwrap.m             % 估计方法 - Extended Kalman Filter
│   ├── pepu_unwrap.m            % 本文方法 (基于修复后的唯一 method_pepu.m)
│   └── compute_phase_continuity.m
│
├── shared/                      % 共享模块
│   ├── wrap_to_pi.m
│   ├── compute_quality_map.m
│   ├── detect_residues.m
│   ├── poisson_fft.m
│   ├── min_cost_flow.m          % 需新实现（真正的网络流）
│   └── soft_threshold.m
│
├── layer2_tdoa/
│   ├── gcc_phat.m
│   └── pepu_tdoa.m
│
├── layer3_doa/
│   ├── estimate_doa.m           % 正文 LS 后端
│   ├── estimate_doa_huber.m     % 补充材料用
│   └── compute_jacobian.m
│
├── crlb/
│   └── compute_crlb.m
│
├── scenes/
│   ├── run_scene_A.m
│   ├── run_scene_B.m
│   ├── run_scene_C.m
│   └── run_scene_D.m
│
├── analysis/
│   ├── run_significance_tests.m
│   ├── record_failure_boundaries.m
│   └── plot_all_figures.m
│
├── verification/
│   ├── verify_phase_ambiguity.m
│   ├── verify_code_fixes.m      % Phase 0 验证脚本
│   └── verify_reproducibility.m
│
└── run_full_pipeline.m          % 一键复现入口
```

---

## 关键约束速查（AI 执行时必须遵守）

| 约束     | 规则                                                                |
| -------- | ------------------------------------------------------------------- |
| 代码修复 | **Phase 0 必须先完成**，所有 26 个问题修复后才能进入 Phase 1-10     |
| 符号约定 | **固定 φ = +2πfτ**，所有方法统一使用正号                            |
| 搜索范围 | **TDOA 搜索范围 [-666.7, 666.7] μs**，覆盖负值                      |
| 对比方法 | **必须实现全部 9 种方法**（8 种对比 + PEPU），不可遗漏              |
| 频点数   | `N_f` 必须由 `length(f_min:delta_f:f_max)` 计算，= 4001，禁止硬编码 |
| 互谱符号 | 固定 `G_ij = Y_i * conj(Y_j)`，相位符号 `+j2πfτ`                    |
| 多径方向 | 每条路径独立 `u_hat_l`，禁止所有路径共用同一方向                    |
| DOA 范围 | 正文固定 θ∈[-180°,180°]步进20°, φ∈[-80°,80°]步进10°                 |
| DOA 后端 | 正文固定 LS；Huber 仅补充材料，且所有方法统一使用                   |
| CRLB     | `mean_f2` 由代码计算，不手工硬编码                                  |
| 随机种子 | 所有仿真文件开头 `rng(42)`                                          |
| 基线集   | 正文主结果用 7 条独立基线（参考阵元 d1），28 对入补充               |
| 退出条件 | 不以"PEPU 赢 N 倍"为准，以"crlb_gap 更小"为准                       |
| 失效边界 | 必须记录，不可隐藏                                                  |
| 伪实现   | **已删除伪 MCF 和伪 LS**，需实现真正的网络流算法                    |

---

## 执行顺序建议

```
Step 1: Phase 0 — 代码修复（前置条件）
  ├── Wave 1: 符号统一 + 伪实现清理
  ├── Wave 2: 致命 Bug 修复
  ├── Wave 3: 二次审查遗漏修复
  ├── Wave 4: PEPU 合并
  ├── Wave 5: 工程改进
  └── Wave 6: 验证脚本

Step 2: Phase 1-10 — 实验框架执行
  ├── Phase 1: 信号生成 + 相位模糊验证
  ├── Phase 2: CRLB 函数实现
  ├── Phase 3: GCC-PHAT 基线实现
  ├── Phase 4: PEPU 实现（基于修复后）
  ├── Phase 5: 对比方法实现（修复后版本）
  ├── Phase 6: DOA 后端实现
  ├── Phase 7: Scene A 全量实验
  ├── Phase 8: Scene B/C/D 实验
  ├── Phase 9: 结果分析与图表生成
  └── Phase 10: 数据存档与复现验证
```

---

## 成功标准

### Phase 0 成功标准

- [ ] 所有 26 个代码问题已修复
- [ ] 符号约定统一为 φ = +2πfτ
- [ ] 伪实现已删除
- [ ] PEPU 合并为唯一版本
- [ ] 搜索范围对称覆盖负值
- [ ] 验证脚本通过所有检查

### Phase 1-10 成功标准

- [ ] 所有 "Must Have" 已实现
- [ ] 所有 "Must NOT Have" 已排除
- [ ] 所有自检断言通过
- [ ] 正文 8 张图全部生成
- [ ] 实验结果可复现（rng(42) 固定）
- [ ] 退出条件满足：PEPU crlb_gap < GCC-PHAT crlb_gap
