# Issues - code-audit-fix

## Known Issues (from code audit)

### Critical Bugs

1. **PEPU v2 dimension transpose** - candidates matrix size unpacked incorrectly
2. **PEPU v2 backtracking crash** - uses floating-point equality for path reconstruction
3. **WLS weights unused** - computed but never applied in accumulation

### Sign Convention Conflicts

- method_least_squares.m uses -slope
- method_quality_guided.m uses -slope
- method_sparse_recon.m uses -slope
- Others use +slope

### Hardcoded Values

- d_max = 0.5 in enhanced (should be 1.0)
- freq_range varies across methods
- TDOA search ranges asymmetric or missing negative values

## Resolved Issues

(none yet - tracking will be added as tasks complete)

## Resolved Issues

### Task 1: Sign Convention - RESOLVED (2026-04-05)

**Original Issue**: Three methods used `-slope` for tau_est calculation

**Resolution**: 
- Files `method_least_squares.m`, `method_quality_guided.m`, `method_sparse_recon.m` no longer exist
- Codebase restructured into `layer1_unwrap/` and `layer2_tdoa/`
- All current implementations use correct `+slope` sign convention
- Verified by grep: no `-slope` found in codebase

**Status**: CLOSED - No action needed
