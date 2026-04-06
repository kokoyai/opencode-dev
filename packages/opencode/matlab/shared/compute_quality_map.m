function qmap = compute_quality_map(phi_wrapped, method)
% compute_quality_map - Compute phase quality map
%
% Args:
%   phi_wrapped - Wrapped phase (radians)
%   method - Quality metric: 'gradient' (default), 'variance', 'pseudo_correlation'
%
% Returns:
%   qmap - Quality map (higher = better quality)

    if nargin < 2
        method = 'gradient';
    end
    
    [nr, nc] = size(phi_wrapped);
    qmap = zeros(nr, nc);
    
    switch lower(method)
        case 'gradient'
            dx = [diff(phi_wrapped, 1, 2), phi_wrapped(:,1) - phi_wrapped(:,end)];
            dy = [diff(phi_wrapped, 1, 1); phi_wrapped(1,:) - phi_wrapped(end,:)];
            dx = wrap_to_pi(dx);
            dy = wrap_to_pi(dy);
            qmap = sqrt(dx.^2 + dy.^2);
            qmap = max(qmap(:)) - qmap;
            
        case 'variance'
            phi_padded = padarray(phi_wrapped, [1,1], 'symmetric');
            for r = 1:nr
                for c = 1:nc
                    local = phi_padded(r:r+2, c:c+2);
                    qmap(r,c) = std(local(:));
                end
            end
            qmap = max(qmap(:)) - qmap;
            
        case 'pseudo_correlation'
            cos_phi = cos(phi_wrapped);
            sin_phi = sin(phi_wrapped);
            kernel = ones(3,3) / 9;
            mean_cos = imfilter(cos_phi, kernel, 'symmetric');
            mean_sin = imfilter(sin_phi, kernel, 'symmetric');
            qmap = sqrt(mean_cos.^2 + mean_sin.^2);
            
        otherwise
            error('Unknown quality method: %s', method);
    end
    
end
