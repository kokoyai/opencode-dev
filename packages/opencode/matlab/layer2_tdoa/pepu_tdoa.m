function [tau_est_us, tdoa_metrics] = pepu_tdoa(phi_unwrapped, params)
% 从解卷绕相位估计TDOA
%   tau_est = slope/(2*pi)，通过最小二乘线性拟合phi vs freq得到
%
% 输出：
%   tau_est_us    - TDOA估计[N_pairs × 1]，单位μs
%   tdoa_metrics  - struct（同gcc_phat输出结构）

    [N_pairs, ~] = size(phi_unwrapped);
    freq_vec = params.freq_vec;
    
    tau_est_us = zeros(N_pairs, 1);
    
    for k = 1:N_pairs
        phi = phi_unwrapped(k, :);
        
        % 线性拟合 phi = 2*pi*tau*f
        % slope = 2*pi*tau
        X = [ones(length(freq_vec), 1), freq_vec'];
        beta = X \ phi';
        slope = beta(2);
        
        % tau = slope / (2*pi)，转换为μs
        tau_est_us(k) = slope / (2 * pi) * 1e6;
    end
    
    tdoa_metrics = struct();
end
