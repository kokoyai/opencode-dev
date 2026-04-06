function test_phase_unwrap_methods()
% test_phase_unwrap_methods - Test all phase unwrapping methods
%
% Validates:
% 1. Unified interface: [phi_unwrapped, phase_metrics] = method_name(phi_wrapped, params)
% 2. Itoh fails under high ambiguity (< 50% success rate with 8 cycles)
% 3. PEPU and SR achieve good accuracy

    fprintf('=== Phase Unwrapping Methods Test ===\n\n');
    
    N_f = 201;
    freq_vec = linspace(150e6, 350e6, N_f);
    
    fprintf('--- Test 1: Basic Interface Test ---\n');
    tau_true = 300;
    phi_true = 2 * pi * freq_vec * tau_true * 1e-6;
    phi_wrapped = mod(phi_true + pi, 2*pi) - pi;
    phi_wrapped = repmat(phi_wrapped, 3, 1);
    
    params = struct('freq_vec', freq_vec);
    
    methods = {'itoh_unwrap', 'qg_unwrap', 'bc_unwrap', ...
               'ict_unwrap', 'sr_unwrap', 'ekf_unwrap', 'pepu_unwrap'};
    
    for i = 1:length(methods)
        method = methods{i};
        try
            func = str2func(method);
            [phi_uw, metrics] = func(phi_wrapped, params);
            fprintf('[PASS] %s: interface OK, C=%.4f\n', ...
                    method, metrics.continuity_score);
        catch ME
            fprintf('[FAIL] %s: %s\n', method, ME.message);
        end
    end
    
    fprintf('\n--- Test 2: Itoh Under High Ambiguity ---\n');
    n_cycles_list = [4, 8, 12, 16];
    success_rate = zeros(size(n_cycles_list));
    
    for i = 1:length(n_cycles_list)
        n = n_cycles_list(i);
        tau_true = n * 666.7 / (2*n);
        phi_true = 2 * pi * freq_vec * tau_true * 1e-6;
        phi_true = phi_true * n;
        phi_w = mod(phi_true + pi, 2*pi) - pi;
        
        n_trials = 10;
        n_success = 0;
        
        for t = 1:n_trials
            try
                [phi_uw, ~] = itoh_unwrap(phi_w, params);
                
                rmse = sqrt(mean((phi_uw - phi_true).^2));
                if rmse < 2*pi
                    n_success = n_success + 1;
                end
            catch
            end
        end
        
        success_rate(i) = n_success / n_trials;
        fprintf('  N=%2d cycles: %.0f%% success rate\n', n, success_rate(i)*100);
    end
    
    if success_rate(2) < 0.5
        fprintf('[PASS] Itoh success rate < 50%% at 8 cycles (%.0f%%)\n', success_rate(2)*100);
    else
        fprintf('[FAIL] Itoh success rate >= 50%% at 8 cycles (%.0f%%)\n', success_rate(2)*100);
    end
    
    fprintf('\n--- Test 3: PEPU Accuracy Test ---\n');
    tau_test = [100, 300, 500, -200, -400];
    
    for i = 1:length(tau_test)
        tau_true = tau_test(i);
        phi_true = 2 * pi * freq_vec * tau_true * 1e-6;
        phi_w = mod(phi_true + pi, 2*pi) - pi;
        
        [phi_uw, ~] = pepu_unwrap(phi_w, params);
        
        rmse = sqrt(mean((phi_uw - phi_true).^2));
        fprintf('  tau=%+.0f us: RMSE=%.4f rad\n', tau_true, rmse);
        
        if rmse > pi
            fprintf('[FAIL] PEPU RMSE > pi rad at tau=%+.0f us\n', tau_true);
        end
    end
    
    fprintf('\n--- Test 4: SR vs PEPU Comparison ---\n');
    tau_test = 450;
    phi_true = 2 * pi * freq_vec * tau_test * 1e-6;
    phi_w = mod(phi_true + pi, 2*pi) - pi;
    
    [phi_sr, ~] = sr_unwrap(phi_w, params);
    [phi_pepu, ~] = pepu_unwrap(phi_w, params);
    
    rmse_sr = sqrt(mean((phi_sr - phi_true).^2));
    rmse_pepu = sqrt(mean((phi_pepu - phi_true).^2));
    
    fprintf('  SR RMSE:   %.4f rad\n', rmse_sr);
    fprintf('  PEPU RMSE: %.4f rad\n', rmse_pepu);
    
    if rmse_pepu < rmse_sr
        fprintf('[PASS] PEPU outperforms SR\n');
    else
        fprintf('[INFO] SR may outperform PEPU for this case\n');
    end
    
    fprintf('\n=== Tests Complete ===\n');
end
