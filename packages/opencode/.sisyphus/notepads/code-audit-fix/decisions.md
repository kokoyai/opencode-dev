# Decisions - code-audit-fix

## Architecture Decisions

### PEPU Consolidation Strategy

- Merge 8 PEPU variants into single `method_pepu.m`
- Use global coarse search + local fine search architecture
- Remove dependency on Itoh pre-estimation for boundary
- Incorporate near-zero protection from v2_final

### File Cleanup Strategy

- Delete fake MCF and LS implementations
- Remove standalone versions in `src/` that duplicate `methods/`
- Extract shared functions to `utils/`

## Key Design Choices

1. **Sign Convention**: Standardize on +slope (matches v3.1 framework)
2. **Search Range**: Use physical bounds [-666.7, 666.7] μs
3. **DOA Estimation**: Use atan2d for quadrant handling
