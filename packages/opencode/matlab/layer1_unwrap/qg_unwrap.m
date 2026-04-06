function [phi_unwrapped, phase_metrics] = qg_unwrap(phi_wrapped, params)
% Quality-Guided质量引导法
% 基于修复后的method_quality_guided_v2.m
% 算法步骤：
%   1. 计算相位质量图（相位导数方差）
%   2. 从高质量种子点开始解卷绕
%   3. 按质量排序逐步扩展

    [N_pairs, N_f] = size(phi_wrapped);
    phi_unwrapped = zeros(size(phi_wrapped));
    
    for k = 1:N_pairs
        phi_w = phi_wrapped(k, :);
        
        quality = zeros(1, N_f);
        quality(1) = inf;
        for i = 2:N_f
            diff = abs(phi_w(i) - phi_w(i-1));
            quality(i) = 1 / (diff + 0.01);
        end
        
        phi_uw = zeros(1, N_f);
        processed = false(1, N_f);
        
        [~, start_idx] = max(quality);
        phi_uw(start_idx) = phi_w(start_idx);
        processed(start_idx) = true;
        
        for iter = 2:N_f
            best_idx = -1;
            best_quality = -inf;
            
            for i = 1:N_f
                if ~processed(i)
                    if (i > 1 && processed(i-1)) || (i < N_f && processed(i+1))
                        if quality(i) > best_quality
                            best_quality = quality(i);
                            best_idx = i;
                        end
                    end
                end
            end
            
            if best_idx == -1
                break;
            end
            
            if best_idx > 1 && processed(best_idx-1)
                diff = phi_w(best_idx) - phi_w(best_idx-1);
                diff = mod(diff + pi, 2*pi) - pi;
                phi_uw(best_idx) = phi_uw(best_idx-1) + diff;
            elseif best_idx < N_f && processed(best_idx+1)
                diff = phi_w(best_idx) - phi_w(best_idx+1);
                diff = mod(diff + pi, 2*pi) - pi;
                phi_uw(best_idx) = phi_uw(best_idx+1) - diff;
            end
            
            processed(best_idx) = true;
        end
        
        phi_unwrapped(k, :) = phi_uw;
    end
    
    C = compute_phase_continuity(phi_unwrapped);
    phase_metrics = struct();
    phase_metrics.continuity_score = C;
end
