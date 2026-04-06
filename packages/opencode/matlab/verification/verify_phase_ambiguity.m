% 验证最大相位缠绕圈数 = 8
% 对最长基线(d=1.0 m)，theta=90°（端射），计算N_wrap

clear; clc;
params = params_global();

d_max = 1.0;
tau_max = d_max / params.c;  % 666.7 μs
N_wrap = params.f_max * tau_max;  % 应 = 8.0

freq_vec = params.freq_vec;
phi_true = 2 * pi * freq_vec * tau_max;
phi_wrapped = angle(exp(1j * phi_true));

figure;
plot(freq_vec/1e3, phi_true/(2*pi), 'b', 'DisplayName','真实相位（圈数）');
hold on;
plot(freq_vec/1e3, phi_wrapped/(2*pi), 'r--', 'DisplayName','包裹相位（圈数）');
xlabel('频率 (kHz)'); ylabel('相位（圈数）');
title(sprintf('最长基线相位模糊验证：N_{wrap} = %.1f', N_wrap));
legend; grid on;

saveas(gcf, 'fig_phase_ambiguity.png');

assert(params.N_f == 4001, 'FAIL: N_f不等于4001');
assert(abs(N_wrap - 8.0) < 0.1, 'FAIL: N_wrap计算异常');

fprintf('Phase 1验证通过：N_wrap = %.1f\n', N_wrap);
