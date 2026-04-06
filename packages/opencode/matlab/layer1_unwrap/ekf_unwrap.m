function [phi_unwrapped, phase_metrics] = ekf_unwrap(phi_wrapped, params)
% Extended Kalman Filter扩展卡尔曼滤波相位解卷绕（简化1D版本）
% 算法：使用EKF跟踪相位和相位变化率
% 简化实现：1D状态估计

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    Q = 0.01;
    R = 0.1;
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        x = [phi_w(1); 0];
        P = eye(2);
        
        phi_uw = zeros(1, N_f);
        phi_uw(1) = x(1);
        
        for i = 2:N_f
            F = [1, 1; 0, 1];
            x_pred = F * x;
            P_pred = F * P * F' + Q * eye(2);
            
            H = [1, 0];
            z_pred = mod(x_pred(1) + pi, 2*pi) - pi;
            y = mod(phi_w(i) - z_pred + pi, 2*pi) - pi;
            
            n = round((x_pred(1) - phi_w(i)) / (2*pi));
            y = phi_w(i) + 2*pi*n - x_pred(1);
            
            S = H * P_pred * H' + R;
            K = P_pred * H' / S;
            
            x = x_pred + K * y;
            P = (eye(2) - K * H) * P_pred;
            
            phi_uw(i) = x(1);
        end
        
        phi_unwrapped(k, :) = phi_uw;
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
