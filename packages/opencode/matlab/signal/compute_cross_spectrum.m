function G = compute_cross_spectrum(Y, pair_list)
% 计算阵元对互功率谱
%   G(k, f) = Y_i(f) * conj(Y_j(f))，对应 pair_list(k,:)=[i,j]
% 输入：
%   Y         - [N_elements × N_f] 频域信号矩阵
%   pair_list - [N_pairs × 2] 阵元对列表
% 输出：
%   G         - [N_pairs × N_f] 复数互功率谱矩阵

    [~, N_f] = size(Y);
    N_pairs = size(pair_list, 1);
    G = zeros(N_pairs, N_f);
    
    for k = 1:N_pairs
        i = pair_list(k, 1);
        j = pair_list(k, 2);
        G(k, :) = Y(i, :) .* conj(Y(j, :));
    end
end
