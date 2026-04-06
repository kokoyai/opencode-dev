function params = params_global()
% params_global - Global parameters for phase-difference fusion system
%
% Returns:
%   params - struct containing all system parameters

    % Sound speed (m/s)
    params.c = 1500;
    
    % Array configuration (8-element uniform linear array)
    params.n_elements = 8;
    
    % Sampling and FFT parameters
    params.fs = 100e3;             % Sampling frequency (Hz)
    params.N = 8192;               % Signal length (samples)
    params.N_FFT = 8192;           % FFT length
    
    % Frequency range
    params.f_min = 8000;           % Minimum frequency (Hz)
    params.f_max = 12000;          % Maximum frequency (Hz)
    
    % Compute frequency vector and count
    params.freq_vec = linspace(params.f_min, params.f_max, 4001)';
    params.N_f = 4001;             % Number of frequency bins
    
    % Array positions (8-element ULA along x-axis, spacing 0.143m)
    % d = 0.143m gives d/λ ≈ 0.5 at f0=10kHz with c=1500
    d_spacing = 0.143;             % Element spacing (m)
    params.array_pos = zeros(8, 3);
    for i = 1:8
        params.array_pos(i, :) = [(i-1) * d_spacing, 0, 0];
    end
    
    % Maximum baseline and time delay
    params.d_max = 1.0;            % Maximum baseline (m)
    params.tau_max = params.d_max / params.c;  % Maximum time delay (s)
    
    % Element pair list for cross-spectrum (all adjacent pairs + reference)
    params.pair_list = [(1:7)', (2:8)'];  % [i, j] pairs (7 adjacent pairs)
    params.ind_pairs = params.pair_list;   % Independent pairs (same as pair_list for ULA)
    
    % Noise parameters
    params.ar_coeffs = [1.0, -0.9, 0.2];  % AR(2) coefficients for colored noise
    
    % Phase ambiguity check
    params.N_wrap = params.f_max * params.tau_max;  % Should be ≈ 8.0
    
end
