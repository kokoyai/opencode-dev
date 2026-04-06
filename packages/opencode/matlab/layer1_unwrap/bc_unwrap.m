function [phi_unwrapped, phase_metrics] = bc_unwrap(phi_wrapped, params)
% Branch-Cut分支截断相位解卷绕（简化1D版本）
% 算法：检测相位不连续点（残差点），在分支截断处停止传播
% 简化实现：使用相位二阶差分检测残差

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        second_diff = diff(phi_w, 2);
        residue_threshold = 0.8 * pi;
        residues = find(abs(second_diff) > residue_threshold) + 1;
        
        phi_uw = zeros(1, N_f);
        phi_uw(1) = phi_w(1);
        
        for i = 2:N_f
            if any(residues == i-1) || any(residues == i)
                phi_uw(i) = phi_w(i);
            else
                diff = phi_w(i) - phi_w(i-1);
                diff = mod(diff + pi, 2*pi) - pi;
                phi_uw(i) = phi_uw(i-1) + diff;
            end
        end
        
        phi_unwrapped(k, :) = phi_uw;
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
