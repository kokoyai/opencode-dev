# Phase-Difference Fusion - Learnings

## 2026-04-04: Phase 1 Implementation

### Signal Generation

- Use `gen_signal.m` with mode='lfm' for chirp signals or 'noise' for band-limited white noise
- Phase convention: φ = +2πfτ (delay → positive phase)
- Output: Y [8 × N_FFT] complex frequency-domain matrix

### Cross-Spectrum Computation

- G(k,f) = Y_i(f) \* conj(Y_j(f))
- This gives phase difference: angle(G) = φ_i - φ_j = 2πf(τ_i - τ_j)

### Phase Ambiguity

- N_wrap = f_max × τ_max = 14 kHz × 533 μs = 7.46 ≈ 8
- Maximum of ~8 phase wraps across the frequency band at maximum delay

### Array Configuration

- 8-element uniform linear array (ULA)
- Half-wavelength spacing (d/λ = 0.5)
- Sound speed c = 1500 m/s

### Parameters (params_global.m)

- fs = 100 kHz (sampling)
- f0 = 10 kHz (center frequency)
- bandwidth = 8 kHz
- tau_max = 533 μs
