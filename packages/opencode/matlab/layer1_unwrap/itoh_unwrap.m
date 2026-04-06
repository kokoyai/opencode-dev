function [phi_unwrapped, phase_metrics] = itoh_unwrap(phi_wrapped, params)
% Itoh局部差分相位解卷绕
% 算法：phi(k) = phi(k-1) + wrap(phi_wrapped(k) - phi_wrapped(k-1))
% 预期：在本系统（8圈模糊）直接失效
% 接口与pepu_unwrap完全相同

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        phi_uw = zeros(1, N_f);
        phi_uw(1) = phi_w(1);
        
        for i = 2:N_f
            diff = phi_w(i) - phi_w(i-1);
            diff = mod(diff + pi, 2*pi) - pi;
            phi_uw(i) = phi_uw(i-1) + diff;
        end
        
        phi_unwrapped(k, :) = phi_uw;
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
