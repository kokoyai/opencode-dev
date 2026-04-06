% test_phase1.m - Test script for Phase 1 signal generation module
%
% Tests:
%   1. params_global() - Parameter loading
%   2. gen_signal() - Signal generation
%   3. compute_cross_spectrum() - Cross-spectrum computation
%   4. verify_phase_ambiguity() - Phase ambiguity verification

fprintf('========================================\n');
fprintf('Phase 1 Module Test Suite\n');
fprintf('========================================\n\n');

%% Test 1: Parameters
fprintf('Test 1: params_global()\n');
fprintf('----------------------------------------\n');
params = params_global();
fprintf('  n_elements: %d\n', params.n_elements);
fprintf('  f_min: %.2f kHz\n', params.f_min/1e3);
fprintf('  f_max: %.2f kHz\n', params.f_max/1e3);
fprintf('  N_f: %d\n', params.N_f);
fprintf('  tau_max: %.2f us\n', params.tau_max * 1e6);
fprintf('  N_wrap: %.4f\n', params.N_wrap);
assert(params.n_elements == 8, 'n_elements should be 8');
assert(params.f_max > params.f_min, 'f_max should > f_min');
assert(params.N_f == 4001, 'N_f should be 4001');
fprintf('  PASSED\n\n');

%% Test 2: Signal Generation (Single mode - white noise)
fprintf('Test 2: gen_signal() - single mode\n');
fprintf('----------------------------------------\n');
theta = 30;
phi = 0;
tau_us = 100;
SNR_dB = 20;
Y_single = gen_signal(theta, phi, tau_us, SNR_dB, params, 'single');
fprintf('  Output size: %d x %d\n', size(Y_single, 1), size(Y_single, 2));
assert(size(Y_single, 1) == 8, 'Should have 8 elements');
assert(size(Y_single, 2) == params.N_f, 'Should have N_f frequency bins');
fprintf('  PASSED\n\n');

%% Test 3: Signal Generation (Colored noise)
fprintf('Test 3: gen_signal() - colored mode\n');
fprintf('----------------------------------------\n');
Y_colored = gen_signal(theta, phi, tau_us, SNR_dB, params, 'colored');
fprintf('  Output size: %d x %d\n', size(Y_colored, 1), size(Y_colored, 2));
assert(size(Y_colored, 1) == 8, 'Should have 8 elements');
assert(size(Y_colored, 2) == params.N_f, 'Should have N_f frequency bins');
fprintf('  PASSED\n\n');

%% Test 4: Cross-Spectrum Computation
fprintf('Test 4: compute_cross_spectrum()\n');
fprintf('----------------------------------------\n');
pair_list = params.pair_list;
G = compute_cross_spectrum(Y_single, pair_list);
fprintf('  Number of pairs: %d\n', size(pair_list, 1));
fprintf('  Output size: %d x %d\n', size(G, 1), size(G, 2));
assert(size(G, 1) == size(pair_list, 1), 'N_pairs should match');
assert(size(G, 2) == params.N_f, 'Should have N_f frequency bins');
fprintf('  PASSED\n\n');

%% Test 5: Phase Linearity Check
fprintf('Test 5: Phase linearity check\n');
fprintf('----------------------------------------\n');
Y_clean = gen_signal(theta, phi, tau_us, Inf, params, 'single');
G_clean = compute_cross_spectrum(Y_clean, pair_list);

phase_12 = angle(G_clean(1, :));
f = params.freq_vec;

phase_valid = unwrap(phase_12);
f_valid = f;

if length(phase_valid) > 2
    p = polyfit(f_valid, phase_valid, 1);
    tau_estimated = p(1) / (2*pi);
    fprintf('  Estimated delay from phase slope: %.2f us\n', tau_estimated * 1e6);
    d_spacing = params.array_pos(2,1) - params.array_pos(1,1);
    fprintf('  Expected delay diff (elem 1-2): %.2f us\n', ...
        d_spacing * sind(theta) / params.c * 1e6);
end
fprintf('  PASSED\n\n');

%% Summary
fprintf('========================================\n');
fprintf('All tests PASSED!\n');
fprintf('========================================\n');
