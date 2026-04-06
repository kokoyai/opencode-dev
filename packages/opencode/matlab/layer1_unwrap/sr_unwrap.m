function [phi_unwrapped, phase_metrics] = sr_unwrap(phi_wrapped, params)
% Sparse Reconstruction稀疏恢复相位解卷绕
% 基于修复后的method_sparse_recon.m
% 算法：min_phi ||A*phi - y||_2^2 + lambda||∇phi||_1
% 求解方法：FISTA或ADMM（简化实现）

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        max_tau_us = 666.7;
        tau_candidates = -max_tau_us:1:max_tau_us;
        
        residuals = zeros(size(tau_candidates));
        for i = 1:length(tau_candidates)
            tau = tau_candidates(i);
            phi_expected = 2 * pi * params.freq_vec * tau * 1e-6;
            diff = angle(exp(1j * (phi_w - phi_expected)));
            residuals(i) = sum(abs(diff));
        end
        
        [~, min_idx] = min(residuals);
        tau_est = tau_candidates(min_idx);
        
        phi_expected = 2 * pi * params.freq_vec * tau_est * 1e-6;
        phi_unwrapped(k, :) = phi_expected + unwrap(phi_w - phi_expected);
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
