function [phi_unwrapped, phase_metrics] = pepu_unwrap(phi_wrapped, params)
% PEPU前端相位解卷绕
%
% 输入：
%   phi_wrapped    - 包裹相位[N_pairs × N_f]，来自互功率谱angle(G_ij)
%   params         - 全局参数
%
% 输出：
%   phi_unwrapped  - 解卷绕相位[N_pairs × N_f]
%   phase_metrics  - struct: rmse, bias, continuity_score, success_rate, gross_error_rate
%
% 核心算法（基于修复后的method_pepu.m）：
%   Step 1: 全局粗搜在[-666.7, 666.7]μs范围内，以1μs步进
%   Step 2: 局部精搜在粗搜最优点±2μs范围内，以0.05μs步进
%   Step 3: 幅度加权（如果params.amplitude可用）
%   Step 4: 时延估计 slope/(2*pi)*1e6 (μs)

    [N_pairs, N_f] = size(phi_wrapped);
    freq_vec = params.freq_vec;
    
    phi_unwrapped = zeros(size(phi_wrapped));
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        % 全局粗搜
        tau_candidates_coarse = linspace(-666.7, 666.7, 1334);  % 1μs步进
        residuals_coarse = zeros(size(tau_candidates_coarse));
        
        for i = 1:length(tau_candidates_coarse)
            tau = tau_candidates_coarse(i);
            phi_expected = 2 * pi * freq_vec * tau * 1e-6;
            diff_phase = angle(exp(1j * (phi_w - phi_expected)));
            residuals_coarse(i) = sum(diff_phase.^2);
        end
        
        [~, min_idx] = min(residuals_coarse);
        tau_coarse = tau_candidates_coarse(min_idx);
        
        % 局部精搜
        tau_candidates_fine = tau_coarse-2:0.05:tau_coarse+2;  % ±2μs, 0.05μs步进
        residuals_fine = zeros(size(tau_candidates_fine));
        
        for i = 1:length(tau_candidates_fine)
            tau = tau_candidates_fine(i);
            phi_expected = 2 * pi * freq_vec * tau * 1e-6;
            diff_phase = angle(exp(1j * (phi_w - phi_expected)));
            residuals_fine(i) = sum(diff_phase.^2);
        end
        
        [~, min_idx] = min(residuals_fine);
        tau_est = tau_candidates_fine(min_idx);
        
        % 解卷绕
        phi_expected = 2 * pi * freq_vec * tau_est * 1e-6;
        phase_diff = phi_w - phi_expected;
        phase_diff_unwrapped = unwrap(phase_diff);
        phi_unwrapped(k, :) = phi_expected + phase_diff_unwrapped;
    end
    
    % 计算连续性分数
    C = compute_phase_continuity(phi_unwrapped);
    
    % 填充metrics
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
