function [tau_est_us, tdoa_metrics] = gcc_phat(Y, pair_list, params, tau_true_us)
% gcc_phat - Standard GCC-PHAT TDOA estimation
%
% Inputs:
%   Y           - [N_elements x N_f] complex frequency-domain signal matrix
%   pair_list   - [N_pairs x 2] matrix of element pairs [i, j]
%   params      - System parameters from params_global()
%   tau_true_us - [N_pairs x 1] true TDOA values in microseconds (optional)
%
% Outputs:
%   tau_est_us  - [N_pairs x 1] estimated TDOA values in microseconds
%   tdoa_metrics - struct with performance metrics:
%                  .rmse          - Root mean square error (μs)
%                  .bias          - Mean error (μs)
%                  .std           - Standard deviation (μs)
%                  .success_rate  - Fraction of estimates within valid range
%                  .gross_error_rate - Fraction of errors > 50 μs
%                  .crlb_gap      - Ratio of RMSE to CRLB
%
% Algorithm:
%   1. Compute cross-power spectrum G_ij(f) = Y_i(f) * conj(Y_j(f))
%   2. PHAT weighting: G_phat = G_ij / |G_ij|
%   3. IFFT to get generalized cross-correlation R_phat(tau)
%   4. Search for peak within tau ∈ [-tau_max, +tau_max]
%   5. Parabolic interpolation refinement
%   6. Convert to microseconds

    [n_elem, n_f] = size(Y);
    n_pairs = size(pair_list, 1);
    
    % Frequency vector
    fs = params.fs;
    n_fft = params.n_fft;
    f = (0:n_f-1)' * fs / n_fft;
    
    % Maximum delay constraint: |tau| <= d_max / c
    % For adjacent elements with d = 0.5λ: tau_max = d/c = 0.5/(f0) ≈ 666.7 μs
    % Using params.tau_max as constraint
    c = params.c;
    f0 = params.f0;
    d = params.element_spacing * c / f0;  % Physical spacing (m)
    tau_max_s = d / c;  % Maximum delay (s) ≈ 666.7 μs for 10 kHz
    
    % Convert to samples
    tau_max_samples = tau_max_s * fs;
    
    % Compute cross-power spectrum for all pairs
    G = compute_cross_spectrum(Y, pair_list);
    
    % Initialize output
    tau_est_us = zeros(n_pairs, 1);
    
    % Process each pair
    for k = 1:n_pairs
        % PHAT weighting: normalize by magnitude
        G_phat = G(k, :) ./ (abs(G(k, :)) + eps);
        
        % IFFT to get generalized cross-correlation
        % Pad to full FFT length for better time resolution
        G_phat_full = [G_phat, conj(G_phat(end-1:-1:2))];
        R_phat = real(ifft(G_phat_full));
        
        % Search for peak within valid range [-tau_max, +tau_max]
        n_corr = length(R_phat);
        half_n = n_corr / 2;
        
        % Sample indices corresponding to delays
        % tau = (idx - 1) / fs for idx = 1..n_fft
        % But we want symmetric around 0, so map to [-half_n, half_n)
        search_range_samples = round(tau_max_samples);
        
        % Define search indices (centered at delay = 0)
        % For positive delay: Y_i arrives before Y_j, peak at positive index
        search_start = max(1, round(half_n - search_range_samples) + 1);
        search_end = min(n_corr, round(half_n + search_range_samples));
        
        % Find peak in search region
        search_region = R_phat(search_start:search_end);
        [peak_val, local_peak_idx] = max(search_region);
        peak_idx = search_start + local_peak_idx - 1;
        
        % Parabolic interpolation for sub-sample accuracy
        if peak_idx > 1 && peak_idx < n_corr
            % Fit parabola to peak and neighbors
            y1 = R_phat(peak_idx - 1);
            y2 = R_phat(peak_idx);
            y3 = R_phat(peak_idx + 1);
            
            % Parabolic fit: y = a*x^2 + b*x + c
            % Peak location: x_peak = -b / (2*a)
            denom = 2 * (y1 - 2*y2 + y3);
            if abs(denom) > eps
                delta = (y1 - y3) / denom;
                delta = max(-1, min(1, delta));  % Clamp to valid range
            else
                delta = 0;
            end
            
            refined_peak_idx = peak_idx + delta;
        else
            refined_peak_idx = peak_idx;
        end
        
        % Convert to time delay (seconds)
        % Index 1 corresponds to tau = 0, index n_fft/2+1 corresponds to tau = -T/2
        tau_samples = refined_peak_idx - 1 - half_n;
        tau_est = tau_samples / fs;
        
        % Convert to microseconds
        tau_est_us(k) = tau_est * 1e6;
    end
    
    % Compute performance metrics if ground truth provided
    if nargin >= 4 && ~isempty(tau_true_us)
        error_us = tau_est_us - tau_true_us;
        
        % RMSE
        tdoa_metrics.rmse = sqrt(mean(error_us.^2));
        
        % Bias
        tdoa_metrics.bias = mean(error_us);
        
        % Standard deviation
        tdoa_metrics.std = std(error_us);
        
        % Success rate (within valid range)
        tau_max_us = tau_max_s * 1e6;
        valid_mask = abs(tau_est_us) <= tau_max_us;
        tdoa_metrics.success_rate = mean(valid_mask);
        
        % Gross error rate (error > 50 μs)
        gross_error_mask = abs(error_us) > 50;
        tdoa_metrics.gross_error_rate = mean(gross_error_mask);
        
        % CRLB gap (ratio of RMSE to CRLB)
        % CRLB ≈ 1 / (2π * sqrt(SNR * N_f * mean(f^2)))
        % This is a simplified version; actual CRLB depends on SNR
        mean_f2 = mean(f.^2);
        % Estimate SNR from signal power (simplified)
        signal_power = mean(abs(Y(:)).^2);
        % Assume noise dominates at low SNR; for metrics, use nominal value
        % For proper CRLB, need actual SNR from params or input
        if isfield(params, 'snr_db')
            SNR_linear = 10^(params.snr_db / 10);
        else
            % Default SNR for CRLB calculation
            SNR_linear = 100;  % 20 dB
        end
        crlb_s = 1 / (2 * pi * sqrt(SNR_linear * n_f * mean_f2));
        crlb_us = crlb_s * 1e6;
        tdoa_metrics.crlb_gap = tdoa_metrics.rmse / crlb_us;
        
        % Store CRLB for reference
        tdoa_metrics.crlb_us = crlb_us;
    else
        tdoa_metrics = struct();
    end
    
    % Self-test assertions (for development/debugging)
    if nargout == 0
        fprintf('gcc_phat self-test:\n');
        fprintf('  Number of pairs: %d\n', n_pairs);
        fprintf('  tau_max: %.1f μs (%.1f samples)\n', tau_max_s * 1e6, tau_max_samples);
        fprintf('  Estimated TDOAs (μs): [%.2f, ..., %.2f]\n', ...
                min(tau_est_us), max(tau_est_us));
        assert(all(abs(tau_est_us) <= tau_max_s * 1e6 * 1.1), ...
               'TDOA estimates exceed valid range');
        fprintf('  Self-test PASSED\n');
    end
end
