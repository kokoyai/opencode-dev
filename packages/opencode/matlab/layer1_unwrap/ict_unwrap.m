function [phi_unwrapped, phase_metrics] = ict_unwrap(phi_wrapped, params)
% Iterative Cosine Transform迭代余弦变换相位解卷绕（简化1D版本）
% 算法：迭代求解泊松方程，同时保持与包裹相位的一致性
% 简化实现：迭代修正相位估计

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    max_iter = 50;
    tolerance = 1e-4;
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        grad = diff(phi_w);
        grad = mod(grad + pi, 2*pi) - pi;
        
        phi_uw = cumsum([0, grad]);
        
        for iter = 1:max_iter
            phi_prev = phi_uw;
            
            grad_est = diff(phi_uw);
            err = mod(grad - grad_est + pi, 2*pi) - pi;
            
            correction = cumsum([0, err]);
            phi_uw = phi_uw + 0.5 * correction;
            
            rewrapped = mod(phi_uw + pi, 2*pi) - pi;
            residual = mean(abs(rewrapped - phi_w));
            
            if residual < tolerance
                break;
            end
        end
        
        phi_unwrapped(k, :) = phi_uw;
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
