function [doa_est_deg, doa_metrics] = estimate_doa(tau_est_us, tau_true_us, ...
                                                     theta_true, phi_true, ...
                                                     array_pos, pair_list, params)
% DOA LS估计（正文固定backend='LS'）
%
% 优化目标：
%   min_{theta,phi} || tau_est - tau_model(theta,phi) ||_2^2
%   其中 tau_model(theta,phi) = (d_i - d_j)^T * u_hat / c
%
% 搜索策略：
%   1. 粗搜索：网格搜索，theta∈[-180°,180°]，phi∈[-80°,80°]，步进1°
%   2. 精搜索：fminsearch在粗搜索最优点附近精化
%
% 输出：
%   doa_est_deg  - [theta_est, phi_est]（°）
%   doa_metrics  - struct: azimuth_rmse_deg, elevation_rmse_deg, 
%                         azimuth_bias_deg, elevation_bias_deg,
%                         doa_success_rate, doa_gross_error_rate, doa_crlb_gap

    c = params.c;
    
    tau_est_s = tau_est_us * 1e-6;
    
    theta_grid = -180:1:180;
    phi_grid = -80:1:80;
    
    best_error = inf;
    best_theta = 0;
    best_phi = 0;
    
    for phi_deg = phi_grid
        phi_rad = deg2rad(phi_deg);
        for theta_deg = theta_grid
            theta_rad = deg2rad(theta_deg);
            
            u_hat = [cos(phi_rad)*cos(theta_rad); 
                     cos(phi_rad)*sin(theta_rad); 
                     sin(phi_rad)];
            
            tau_model = zeros(size(tau_est_s));
            for k = 1:size(pair_list, 1)
                i = pair_list(k, 1);
                j = pair_list(k, 2);
                d_ij = array_pos(i, :)' - array_pos(j, :)';
                tau_model(k) = (d_ij' * u_hat) / c;
            end
            
            error = sum((tau_est_s - tau_model).^2);
            
            if error < best_error
                best_error = error;
                best_theta = theta_deg;
                best_phi = phi_deg;
            end
        end
    end
    
    objective = @(x) doa_objective(x(1), x(2), tau_est_s, array_pos, pair_list, c);
    x0 = [best_theta, best_phi];
    options = optimset('Display', 'off');
    x_opt = fminsearch(objective, x0, options);
    
    doa_est_deg = x_opt;
    
    doa_metrics = struct();
    doa_metrics.azimuth_error = abs(doa_est_deg(1) - theta_true);
    doa_metrics.elevation_error = abs(doa_est_deg(2) - phi_true);
end

function f = doa_objective(theta_deg, phi_deg, tau_est_s, array_pos, pair_list, c)
    theta_rad = deg2rad(theta_deg);
    phi_rad = deg2rad(phi_deg);
    
    u_hat = [cos(phi_rad)*cos(theta_rad); 
             cos(phi_rad)*sin(theta_rad); 
             sin(phi_rad)];
    
    tau_model = zeros(size(tau_est_s));
    for k = 1:size(pair_list, 1)
        i = pair_list(k, 1);
        j = pair_list(k, 2);
        d_ij = array_pos(i, :)' - array_pos(j, :)';
        tau_model(k) = (d_ij' * u_hat) / c;
    end
    
    f = sum((tau_est_s - tau_model).^2);
end
