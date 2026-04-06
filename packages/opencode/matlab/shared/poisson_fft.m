function phi = poisson_fft(div, boundary)
% poisson_fft - Solve Poisson equation using FFT (Dirichlet boundary)
%
% Solves: ∇²φ = div with φ = 0 on boundary
%
% Args:
%   div - Divergence field (right-hand side)
%   boundary - Boundary condition: 'dirichlet' (default), 'neumann'
%
% Returns:
%   phi - Solution to Poisson equation

    if nargin < 2
        boundary = 'dirichlet';
    end
    
    [nr, nc] = size(div);
    
    [kx, ky] = meshgrid(0:nc-1, 0:nr-1);
    
    switch lower(boundary)
        case 'dirichlet'
            cos_x = cos(pi * kx / nc);
            cos_y = cos(pi * ky / nr);
            denom = 2 * (cos_x + cos_y - 2);
            denom(1,1) = -1;
            
            div_sym = zeros(2*nr, 2*nc);
            div_sym(1:nr, 1:nc) = div;
            div_sym(nr+1:end, 1:nc) = flipud(div(2:end,:));
            div_sym(:, nc+1:end) = fliplr(div_sym(:, 2:nc));
            
            div_hat = fft2(div_sym);
            div_hat = div_hat(1:nr, 1:nc);
            
            phi_hat = div_hat ./ denom;
            phi_hat(1,1) = 0;
            
            phi_full = ifft2([phi_hat, conj(fliplr(phi_hat(:,2:end)));
                              conj(flipud(phi_hat(2:end,:))), ...
                              conj(flipud(fliplr(phi_hat(2:end,2:end))))]);
            phi = real(phi_full(1:nr, 1:nc));
            
        case 'neumann'
            denom = 2 * (cos(2*pi*kx/nc) + cos(2*pi*ky/nr) - 2);
            denom(1,1) = 1;
            
            div_hat = fft2(div);
            phi_hat = div_hat ./ denom;
            phi_hat(1,1) = 0;
            
            phi = real(ifft2(phi_hat));
            
        otherwise
            error('Unknown boundary condition: %s', boundary);
    end
    
end
