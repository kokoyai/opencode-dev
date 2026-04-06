# Learnings - code-audit-fix

## Session Started: 2026-04-04

### Plan Overview

- **Total Tasks**: 17 implementation + 4 final verification
- **Waves**: 6 execution waves + Final Wave
- **Key Focus**: MATLAB code quality fixes for JASA submission

### Critical Conventions

1. **Sign Convention**: φ = +2πfτ (positive slope)
2. **TDOA Range**: [-666.7, 666.7] μs (symmetric)
3. **Default freq_range**: [8000, 12000]
4. **d_max**: 1.0 m (array maximum baseline)
5. **Azimuth Range**: [-180°, 180°]

### Must NOT Do

- Do NOT introduce new method files
- Do NOT change method interface signatures
- Do NOT modify plan.md experimental framework
- Do NOT add MATLAB toolbox dependencies

## Progress Log

- [Session 1-3] Previous sessions (no progress recorded)
- [Session 4] Starting Wave 1 execution

## Task 3: freq_range 统一

### 问题发现

- 任务引用的文件结构 (`matlab/src/methods/method_*.m`) 不存在
- 实际文件在 `matlab/layer1_unwrap/*_unwrap.m`
- 无 `freq_range` 参数，频率范围集中在 `params_global.m`

### 当前状态

- `params_global.m` 已正确设置 `f_min=8000, f_max=12000`
- 无需修改，代码已符合要求

### 结论

- 任务描述基于旧代码结构
- 当前代码库已满足目标（频率范围 8-12 kHz）

## Task 1: Sign Convention - COMPLETED

### Date: 2026-04-05

### Finding

The codebase has been restructured since the plan was created:

- Original files `method_least_squares.m`, `method_quality_guided.m`, `method_sparse_recon.m` don't exist
- Replaced by `layer1_unwrap/ls_unwrap.m`, `qg_unwrap.m`, `sr_unwrap.m`

### Verification Results

1. **Sign convention**: All files use correct `φ = +2πfτ` (positive slope)
   - `pepu_tdoa.m:24`: `tau_est_us(k) = slope / (2 * pi) * 1e6` ✓
   - `pepu_unwrap.m:32,46,55`: `phi_expected = 2 * pi * freq_vec * tau * 1e-6` ✓
   - `sr_unwrap.m:19,27`: `phi_expected = 2 * pi * params.freq_vec * tau * 1e-6` ✓

2. **No `-slope` found** in entire matlab/ directory

3. **No wrong comment** "交叉谱相位 φ = -2πfτ" found

### Status: ALREADY CORRECT

The sign convention issue has been resolved or never existed in the current codebase structure.

## Task 2: 删除伪实现方法 - COMPLETED

### Date: 2026-04-05

### Files Deleted

- `matlab/layer1_unwrap/mcf_unwrap.m` - Fake MCF (greedy algorithm, not min-cost flow)
- `matlab/layer1_unwrap/ls_unwrap.m` - Fake LS (just cumsum/Itoh, not least-squares)

### Analysis

Both files claimed to implement advanced algorithms but were actually:

- `mcf_unwrap.m`: Comments said "Min-Cost Flow" but used a simple greedy gradient-based algorithm with consistency weighting
- `ls_unwrap.m`: Comments said "Least-Squares" and "FFT solve Poisson" but implementation was just `cumsum([0, grad])` (identical to Itoh)

### References Cleaned

- Removed from `test_phase_unwrap_methods.m:22-23`

### Verification

- Files deleted ✓
- No remaining references in codebase ✓
- `itoh_unwrap.m` retained (correct Itoh implementation) ✓

### Note on method_dct_unwrap.m

The plan mentioned `method_dct_unwrap.m` as "real LS" to keep, but this file does not exist in the current codebase. No DCT-based unwrap implementation found.

## Task 4: d_max 硬编码 - ALREADY CORRECT

### Date: 2026-04-05

### Finding

The file `matlab/src/methods/method_pepu_enhanced.m` does not exist. The codebase has been restructured.

### Current Structure

- `params_global.m:35` - `d_max = 1.0` ✓ (correct)
- `params_global.m:36` - `tau_max = d_max / c` = 1.0/1500 = 666.7 μs ✓
- `pepu_unwrap.m:27` - `linspace(-666.7, 666.7, 1334)` ✓ (correct range)

### Verification

```
grep -n "d_max" matlab/params_global.m
35:    params.d_max = 1.0;
```

### Status: NO ACTION NEEDED

The `d_max = 1.0` is already correctly set in `params_global.m` and used throughout the codebase. The `pepu_unwrap.m` already uses the correct symmetric TDOA range [-666.7, 666.7] μs.
