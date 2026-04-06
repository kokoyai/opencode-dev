%% test_gcc_phat.m - Test GCC-PHAT TDOA estimation
%
% Verifies:
%   - SNR=20dB error < 5 us
%   - Search range limited to |tau| <= d_max/c
%   - Standard implementation without prior constraints

clear; close all; clc;

%% Load parameters
params = params_global();

%% Test 1: Single source, SNR=20dB
fprintf('Test 1: Single source, SNR=20dB\n');
fprintf('================================\n');

theta_deg = 30;
phi_deg = 0;
tau_us = 100;
SNR_dB = 20;

Y = gen_signal(theta_deg, phi_deg, tau_us, SNR_dB, params, 'lfm');

c = params.c;
f0 = params.f0;
d = params.element_spacing * c / f0;
theta_rad = deg2rad(theta_deg);

pair_list = params.pair_list;
n_pairs = size(pair_list, 1);
tau_true_us = zeros(n_pairs, 1);

for k = 1:n_pairs
    i = pair_list(k, 1);
    j = pair_list(k, 2);
    delta_tau = (j - i) * d * sin(theta_rad) / c;
    tau_true_us(k) = delta_tau * 1e6;
end

[tau_est_us, metrics] = gcc_phat(Y, pair_list, params, tau_true_us);

fprintf('\nTrue TDOA values (us):\n');
disp(tau_true_us');

fprintf('Estimated TDOA values (us):\n');
disp(tau_est_us');

fprintf('Errors (us):\n');
disp((tau_est_us - tau_true_us)');

fprintf('\nMetrics:\n');
fprintf('  RMSE:    %.3f us\n', metrics.rmse);
fprintf('  Bias:    %.3f us\n', metrics.bias);
fprintf('  Std:     %.3f us\n', metrics.std);
fprintf('  CRLB:    %.3f us\n', metrics.crlb_us);
fprintf('  CRLB Gap: %.2fx\n', metrics.crlb_gap);

assert(metrics.rmse < 5, ...
       sprintf('RMSE (%.2f us) exceeds 5 us threshold at SNR=20dB', metrics.rmse));
fprintf('\nTest 1 PASSED: RMSE < 5 us\n\n');

%% Test 2: Multiple angles
fprintf('Test 2: Multiple angles, SNR=20dB\n');
fprintf('==================================\n');

angles = [-60, -30, 0, 30, 60];
rmse_results = zeros(size(angles));

for i = 1:length(angles)
    theta = angles(i);
    Y = gen_signal(theta, 0, 100, SNR_dB, params, 'lfm');
    theta_rad = deg2rad(theta);
    for k = 1:n_pairs
        j = pair_list(k, 2);
        idx = pair_list(k, 1);
        delta_tau = (j - idx) * d * sin(theta_rad) / c;
        tau_true_us(k) = delta_tau * 1e6;
    end
    [~, metrics] = gcc_phat(Y, pair_list, params, tau_true_us);
    rmse_results(i) = metrics.rmse;
    fprintf('  theta=%3d deg: RMSE=%.3f us\n', theta, metrics.rmse);
end

fprintf('\nMaximum RMSE: %.3f us\n', max(rmse_results));
assert(max(rmse_results) < 5, 'RMSE exceeds 5 us threshold');
fprintf('Test 2 PASSED: All angles RMSE < 5 us\n\n');

%% Test 3: Search range constraint
fprintf('Test 3: Search range constraint\n');
fprintf('================================\n');

tau_max_us = d / c * 1e6;
fprintf('Maximum TDOA (d/c): %.1f us\n', tau_max_us);

theta = 89;
Y = gen_signal(theta, 0, 100, SNR_dB, params, 'lfm');

theta_rad = deg2rad(theta);
for k = 1:n_pairs
    j = pair_list(k, 2);
    idx = pair_list(k, 1);
    delta_tau = (j - idx) * d * sin(theta_rad) / c;
    tau_true_us(k) = delta_tau * 1e6;
end

[tau_est_us, metrics] = gcc_phat(Y, pair_list, params, tau_true_us);

fprintf('Estimated TDOA range: [%.1f, %.1f] us\n', min(tau_est_us), max(tau_est_us));
fprintf('Valid range: [%.1f, %.1f] us\n', -tau_max_us, tau_max_us);

assert(all(abs(tau_est_us) <= tau_max_us * 1.01), ...
       'TDOA estimates exceed valid search range');
fprintf('Test 3 PASSED: All estimates within search range\n\n');

%% Test 4: Different SNR levels
fprintf('Test 4: Different SNR levels\n');
fprintf('=============================\n');

SNR_levels = [30, 20, 10, 0];
theta = 30;
theta_rad = deg2rad(theta);

for k = 1:n_pairs
    j = pair_list(k, 2);
    idx = pair_list(k, 1);
    delta_tau = (j - idx) * d * sin(theta_rad) / c;
    tau_true_us(k) = delta_tau * 1e6;
end

for i = 1:length(SNR_levels)
    snr = SNR_levels(i);
    Y = gen_signal(theta, 0, 100, snr, params, 'lfm');
    [~, metrics] = gcc_phat(Y, pair_list, params, tau_true_us);
    fprintf('  SNR=%2ddB: RMSE=%.3f us, Gross error rate=%.1f%%\n', ...
            snr, metrics.rmse, metrics.gross_error_rate * 100);
end

fprintf('\nAll tests PASSED\n');
