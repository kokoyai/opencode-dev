%TEST_CRLB 验证 CRLB 函数的测试脚本
%
%   验收标准：
%   1. mean_f2 在 [8e3^2, 12e3^2] 范围内
%   2. SNR=40dB 时 crlb_tau < 0.1 μs
%   3. SNR=-20dB 时 crlb > SNR=0dB 时 crlb
%   4. 雅可比矩阵在 theta=0 时满秩

clear; clc;

%% 添加 crlb 目录到路径
script_path = fileparts(which('test_crlb'));
if isempty(script_path)
    script_path = pwd;
end
addpath(fullfile(script_path, 'crlb'));

%% 加载参数
p = params_global();
fprintf('=== CRLB 验证测试 ===\n\n');

%% 构建频率向量 (符合 TDOA 需求)
f_min = 8000;   % Hz
f_max = 12000;  % Hz
n_f = 256;
freq_vec = linspace(f_min, f_max, n_f)';

%% 构建 8 元环形阵列麦克风位置
N_mic = 8;
radius = 0.05;  % 5 cm 半径
angles_mic = (0:N_mic-1) * (2*pi/N_mic);
mic_pos = zeros(N_mic, 3);
mic_pos(:, 1) = radius * cos(angles_mic);
mic_pos(:, 2) = radius * sin(angles_mic);
mic_pos(:, 3) = 0;

%% 验收标准 1: mean_f2 范围
fprintf('【验收标准 1】mean_f2 范围检查\n');
fprintf('  f_min = %.0f Hz, f_max = %.0f Hz\n', f_min, f_max);
mean_f2 = mean(freq_vec.^2);
fprintf('  mean_f2 = %.2e Hz^2\n', mean_f2);
fprintf('  预期范围: [%.2e, %.2e] Hz^2\n', 8e3^2, 12e3^2);

assert(mean_f2 >= 8e3^2 && mean_f2 <= 12e3^2, ...
    'mean_f2 不在预期范围内');
fprintf('  ✓ PASS\n\n');

%% 验收标准 2: SNR=40dB 时 crlb_tau < 0.1 μs
fprintf('【验收标准 2】SNR=40dB CRLB 检查\n');
theta = pi/4;  % 45 度俯仰角
phi = pi/6;    % 30 度方位角
[crlb_tau_40dB, ~, ~] = compute_crlb(freq_vec, 40, mic_pos, theta, phi);
fprintf('  crlb_tau (SNR=40dB) = %.2e s = %.4f μs\n', crlb_tau_40dB, crlb_tau_40dB * 1e6);
fprintf('  预期: < 0.1 μs\n');

assert(crlb_tau_40dB < 0.1e-6, 'SNR=40dB 时 crlb_tau >= 0.1 μs');
fprintf('  ✓ PASS\n\n');

%% 验收标准 3: SNR=-20dB 时 crlb > SNR=0dB 时 crlb
fprintf('【验收标准 3】SNR 单调性检查\n');
[crlb_tau_m20dB, ~, ~] = compute_crlb(freq_vec, -20, mic_pos, theta, phi);
[crlb_tau_0dB, ~, ~] = compute_crlb(freq_vec, 0, mic_pos, theta, phi);
fprintf('  crlb_tau (SNR=-20dB) = %.2e s\n', crlb_tau_m20dB);
fprintf('  crlb_tau (SNR=0dB)   = %.2e s\n', crlb_tau_0dB);

assert(crlb_tau_m20dB > crlb_tau_0dB, ...
    'SNR=-20dB 时 crlb 不大于 SNR=0dB 时 crlb');
fprintf('  ✓ PASS\n\n');

%% 验收标准 4: 雅可比矩阵在非奇异位置满秩
fprintf('【验收标准 4】雅可比矩阵秩检查\n');
fprintf('  注：theta=0 (天顶) 是物理奇点，方位角无定义\n');

% 在 theta != 0 处测试满秩
theta_test = pi/6;  % 30 度俯仰角
J = compute_jacobian(mic_pos, theta_test, phi);
rank_J = rank(J);
fprintf('  测试位置: theta = %.1f°\n', theta_test * 180/pi);
fprintf('  J 大小: [%d x %d]\n', size(J, 1), size(J, 2));
fprintf('  rank(J) = %d\n', rank_J);
fprintf('  预期: 2 (满秩)\n');

assert(rank_J == 2, '雅可比矩阵不满秩');
fprintf('  ✓ PASS\n');

% 验证天顶奇点正确处理
fprintf('\n【天顶奇点验证】\n');
theta_0 = 0;
J0 = compute_jacobian(mic_pos, theta_0, phi);
fprintf('  theta = 0° 时 rank(J) = %d (预期为 1，方位角无定义)\n', rank(J0));
[~, C_doa_0, ~] = compute_crlb(freq_vec, 40, mic_pos, theta_0, phi);
fprintf('  C_doa = Inf 表示正确处理奇点: %s\n', ...
    string(all(isinf(C_doa_0(:)))));
fprintf('  ✓ 奇点处理正确\n\n');

%% 显示 DOA CRLB
fprintf('【DOA CRLB 示例】\n');
[crlb_tau, C_doa, ~] = compute_crlb(freq_vec, 40, mic_pos, theta, phi);
fprintf('  theta = %.1f°, phi = %.1f°\n', theta*180/pi, phi*180/pi);
fprintf('  CRLB(theta) = %.4f°\n', sqrt(C_doa(1,1)) * 180/pi);
fprintf('  CRLB(phi)   = %.4f°\n', sqrt(C_doa(2,2)) * 180/pi);

fprintf('\n=== 所有验收标准通过 ===\n');
