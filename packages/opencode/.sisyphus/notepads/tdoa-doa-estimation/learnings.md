# Learnings

## CRLB Implementation

1. **TDOA CRLB formula**: `sigma_tau = 1 / (2*pi * sqrt(SNR * N_f * mean_f2))`
   - Higher SNR → smaller CRLB
   - More frequency bins → smaller CRLB
   - Higher frequencies → smaller CRLB (more timing resolution)

2. **Jacobian singularity at zenith**: For planar arrays, theta=0 (source at zenith) is a physical singularity where azimuth angle is undefined. The Jacobian has rank 1 at this point, not rank 2.

3. **Independent baselines**: Using reference mic d1 with N_mic-1 baselines gives N_pairs = 7 for an 8-mic array.

4. **DOA CRLB propagation**: `C_doa = crlb_tau^2 * inv(J' * J)` when all TDOAs are independent with equal variance.

## Test Results

- mean_f2 = 1.01e8 Hz² (within [64e6, 144e6])
- SNR=40dB: crlb_tau = 0.0099 μs (< 0.1 μs)
- SNR monotonicity verified
- Jacobian full rank at theta ≠ 0
- Zenith singularity handled correctly (returns Inf)
