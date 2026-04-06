function C = compute_phase_continuity(phi_unwrapped)
% 计算二阶差分连续性分数（附录A严格定义）
%   delta2_phi = phi(k+1) - 2*phi(k) + phi(k-1)
%   C = exp(-var(delta2_phi) / (2*pi*delta_f)^2)
%   C∈[0,1]，完美线性相位→C=1

    [N_pairs, N_f] = size(phi_unwrapped);
    C_vec = zeros(N_pairs, 1);
    
    for k = 1:N_pairs
        phi = phi_unwrapped(k, :);
        % 二阶差分
        delta2_phi = phi(3:end) - 2*phi(2:end-1) + phi(1:end-2);
        var_delta2 = var(delta2_phi);
        % 连续性分数
        C_vec(k) = exp(-var_delta2 / (2*pi)^2);
    end
    
    C = mean(C_vec);
end
