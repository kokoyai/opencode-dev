function tau_true_us = compute_true_tdoa(theta_deg, phi_deg, params)
% 计算给定DOA的真实TDOA
%
% 输入：
%   theta_deg  - 方位角(°)
%   phi_deg    - 俯仰角(°)
%   params     - 全局参数
%
% 输出：
%   tau_true_us  - 真实TDOA [N_pairs × 1]，单位μs

    theta_rad = deg2rad(theta_deg);
    phi_rad = deg2rad(phi_deg);
    
    u_hat = [cos(phi_rad)*cos(theta_rad); 
             cos(phi_rad)*sin(theta_rad); 
             sin(phi_rad)];
    
    pair_list = params.ind_pairs;
    array_pos = params.array_pos;
    c = params.c;
    
    N_pairs = size(pair_list, 1);
    tau_true_s = zeros(N_pairs, 1);
    
    for k = 1:N_pairs
        i = pair_list(k, 1);
        j = pair_list(k, 2);
        d_ij = array_pos(i, :)' - array_pos(j, :)';
        tau_true_s(k) = (d_ij' * u_hat) / c;
    end
    
    tau_true_us = tau_true_s * 1e6;
end
