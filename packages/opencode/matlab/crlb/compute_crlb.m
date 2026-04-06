function [crlb_tau_us, crlb_doa_deg] = compute_crlb(snr_db, theta_deg, phi_deg, params)
% 单径工作型TDOA CRLB + DOA下界
%
% TDOA CRLB公式：
%   sigma_tau = 1 / (2*pi * sqrt(SNR * N_f * mean_f2))
%   其中 mean_f2 = mean(freq_vec.^2)，由代码计算
%
% DOA下界（误差传播）：
%   C_doa = inv(J' * inv(C_tau) * J)
%   其中 J 为独立基线集的雅可比矩阵，C_tau = diag(sigma_tau^2, ...)
%
% 输出：
%   crlb_tau_us   - TDOA CRLB (μs)
%   crlb_doa_deg  - [sigma_theta, sigma_phi] (°)，独立基线集误差传播结果

    freq_vec = params.freq_vec;
    mean_f2 = mean(freq_vec .^ 2);
    
    SNR_linear = 10^(snr_db / 10);
    sigma_tau = 1 / (2 * pi * sqrt(SNR_linear * params.N_f * mean_f2));
    crlb_tau_us = sigma_tau * 1e6;
    
    pair_list = params.ind_pairs;
    array_pos = params.array_pos;
    c = params.c;
    
    J = compute_jacobian(theta_deg, phi_deg, pair_list, array_pos, c);
    
    N_pairs = size(pair_list, 1);
    C_tau = eye(N_pairs) * sigma_tau^2;
    
    C_doa = inv(J' * inv(C_tau) * J);
    
    crlb_doa_deg = sqrt(diag(C_doa)) * 180/pi;
end
