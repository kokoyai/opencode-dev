# Phase-Difference Fusion - MATLAB Signal Generation Module

## Directory Structure

```
matlab/
├── params_global.m              # Global system parameters
├── signal/
│   ├── gen_signal.m             # Generate 8-element received signals (frequency domain)
│   └── compute_cross_spectrum.m # Compute cross-power spectrum for element pairs
├── verification/
│   └── verify_phase_ambiguity.m # Verify max phase wrapping count = 8
└── test_phase1.m                # Test script for Phase 1 module
```

## Quick Start

```matlab
% Load parameters
params = params_global();

% Generate test signal
Y = gen_signal(30, 0, 100, 20, params, 'lfm');

% Compute cross-spectrum
G = compute_cross_spectrum(Y, params.pair_list);

% Verify phase ambiguity
N_wrap = verify_phase_ambiguity(params);
```

## Function Reference

### params_global()

Returns system parameters:

- `c = 1500 m/s` - Sound speed
- `n_elements = 8` - Array element count
- `element_spacing = 0.5` - Normalized spacing (d/λ)
- `fs = 100 kHz` - Sampling frequency
- `f0 = 10 kHz` - Center frequency
- `bandwidth = 8 kHz` - Signal bandwidth
- `tau_max = 533 μs` - Maximum time delay
- `n_wrap_max ≈ 8` - Maximum phase wraps

### gen_signal(theta, phi, tau_us, SNR_dB, params, mode)

Generate 8-element received signals in frequency domain.

**Inputs:**

- `theta_deg` - Azimuth angle (degrees)
- `phi_deg` - Elevation angle (degrees)
- `tau_us` - Reference time delay (microseconds)
- `SNR_dB` - Signal-to-noise ratio (dB)
- `params` - System parameters
- `mode` - Signal type: `'lfm'` or `'noise'`

**Output:**

- `Y [8 × N_FFT]` - Complex frequency-domain signal matrix

**Phase Convention:** φ = +2πfτ (delay → positive phase)

### compute_cross_spectrum(Y, pair_list)

Compute cross-power spectrum for element pairs.

**Inputs:**

- `Y [N_elem × N_f]` - Frequency-domain signal matrix
- `pair_list [N_pairs × 2]` - Element index pairs [i, j]

**Output:**

- `G [N_pairs × N_f]` - Complex cross-spectrum
- `G(k, f) = Y_i(f) × conj(Y_j(f))`

### verify_phase_ambiguity(params)

Verify maximum phase wrapping count ≈ 8.

**Output:**

- `N_wrap` - Maximum number of 2π wraps
- Saves figure to `fig_phase_ambiguity.png`

## Phase Ambiguity

The maximum phase ambiguity is calculated as:

```
N_wrap = f_max × τ_max
       = 14 kHz × 533 μs
       = 7.46 ≈ 8
```

This means the phase wraps around 2π approximately 8 times across the frequency band at maximum delay.

## Test

Run the test suite:

```matlab
run('test_phase1.m')
```

Expected output: All 6 tests should pass.
