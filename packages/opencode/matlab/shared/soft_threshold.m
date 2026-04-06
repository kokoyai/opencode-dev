function y = soft_threshold(x, lambda)
% soft_threshold - Soft thresholding operator for sparse optimization
%
% Args:
%   x - Input signal
%   lambda - Threshold parameter
%
% Returns:
%   y - Soft-thresholded signal
%
% Formula: y = sign(x) * max(|x| - lambda, 0)

    y = sign(x) .* max(abs(x) - lambda, 0);
    
end
