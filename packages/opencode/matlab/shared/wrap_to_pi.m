function phi_wrapped = wrap_to_pi(phi)
% wrap_to_pi - Wrap phase to [-π, π] range
%
% Args:
%   phi - Input phase (any range)
%
% Returns:
%   phi_wrapped - Phase wrapped to [-π, π]

    phi_wrapped = mod(phi + pi, 2*pi) - pi;
    
end
