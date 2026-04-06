function J = compute_jacobian(theta_deg, phi_deg, pair_list, array_pos, c)
% 计算独立基线集TDOA对[theta, phi]的雅可比矩阵
% 输出：J [N_pairs × 2]，单位：s/rad（后续转换）
% 使用解析公式：
%   d(tau_ij)/d(theta) = (d_i-d_j)' * d(u_hat)/d(theta) / c
%   d(tau_ij)/d(phi)   = (d_i-d_j)' * d(u_hat)/d(phi)   / c

    theta_rad = deg2rad(theta_deg);
    phi_rad = deg2rad(phi_deg);
    
    u_hat = [cos(phi_rad)*cos(theta_rad); 
             cos(phi_rad)*sin(theta_rad); 
             sin(phi_rad)];
    
    du_dtheta = [-cos(phi_rad)*sin(theta_rad);
                  cos(phi_rad)*cos(theta_rad);
                  0];
    
    du_dphi = [-sin(phi_rad)*cos(theta_rad);
               -sin(phi_rad)*sin(theta_rad);
                cos(phi_rad)];
    
    N_pairs = size(pair_list, 1);
    J = zeros(N_pairs, 2);
    
    for k = 1:N_pairs
        i = pair_list(k, 1);
        j = pair_list(k, 2);
        d_ij = array_pos(i, :)' - array_pos(j, :)';
        
        J(k, 1) = (d_ij' * du_dtheta) / c;
        
        J(k, 2) = (d_ij' * du_dphi) / c;
    end
end
