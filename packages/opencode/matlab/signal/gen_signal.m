function Y = gen_signal(theta_deg, phi_deg, tau_us, SNR_dB, params, mode)
% 生成8阵元接收信号（频域）
% 
% 输入：
%   theta_deg  - 声源方位角(°)
%   phi_deg    - 声源俯仰角(°)
%   tau_us     - 主路径基础时延(μs)，单径模式下不使用
%   SNR_dB     - 信噪比(dB)
%   params     - 全局参数结构体
%   mode       - 'single'|'colored'|'multipath'
%
% 输出：
%   Y          - [8 × N_f] 复数频域信号矩阵
%
% 实现步骤：
%   1. 生成宽带线性调频信号，长度N
%   2. 计算每个阵元的到达时延 tau_i = d_i^T * u_hat / c
%      u_hat = [cos(phi)*cos(theta); cos(phi)*sin(theta); sin(phi)]
%   3. 频域乘以 exp(+j*2*pi*f*tau_i)施加时延
%   4. 加入噪声（白噪声或AR(2)有色噪声，按mode）
%   5. FFT，截取[f_min, f_max]频点
%   6. 返回Y[8 × N_f]复数矩阵

    fs = params.fs;
    N = params.N;
    N_FFT = params.N_FFT;
    c = params.c;
    f_min = params.f_min;
    f_max = params.f_max;
    array_pos = params.array_pos;
    freq_vec = params.freq_vec;
    N_f = params.N_f;
    
    theta_rad = deg2rad(theta_deg);
    phi_rad = deg2rad(phi_deg);
    u_hat = [cos(phi_rad)*cos(theta_rad); cos(phi_rad)*sin(theta_rad); sin(phi_rad)];
    
    t = (0:N-1)' / fs;
    f0 = f_min;
    f1 = f_max;
    s = chirp(t, f0, N/fs, f1);
    
    tau_elem = array_pos * u_hat / c;
    
    S_f = fft(s, N_FFT);
    
    Y_f = zeros(8, N_FFT);
    for i = 1:8
        Y_f(i, :) = S_f .* exp(1j * 2 * pi * (0:N_FFT-1)' * fs/N_FFT * tau_elem(i));
    end
    
    switch lower(mode)
        case 'single'
            noise = randn(8, N_FFT) + 1j * randn(8, N_FFT);
        case 'colored'
            noise = generate_colored_noise(8, N_FFT, params);
        case 'multipath'
            noise = randn(8, N_FFT) + 1j * randn(8, N_FFT);
        otherwise
            noise = randn(8, N_FFT) + 1j * randn(8, N_FFT);
    end
    
    sig_power = mean(abs(Y_f).^2, 'all');
    noise_power = mean(abs(noise).^2, 'all');
    noise_scale = sqrt(sig_power / (10^(SNR_dB/10)) / noise_power);
    Y_f = Y_f + noise * noise_scale;
    
    f_idx = round((freq_vec - 0) / (fs/N_FFT) + 1);
    f_idx = max(1, min(N_FFT, f_idx));
    
    Y = Y_f(:, f_idx);
end

function noise = generate_colored_noise(n_rows, n_cols, params)
% Generate AR(2) colored noise

    ar_coeffs = params.ar_coeffs;
    noise = zeros(n_rows, n_cols);
    
    for row = 1:n_rows
        x = zeros(n_cols * 2, 1);
        w = randn(n_cols * 2, 1);
        
        for n = 3:length(x)
            x(n) = w(n) - ar_coeffs(2) * x(n-1) - ar_coeffs(3) * x(n-2);
        end
        
        x = x(end-n_cols+1:end);
        noise(row, :) = x.' + 1j * (randn(1, n_cols) * 0.5);
    end
end
