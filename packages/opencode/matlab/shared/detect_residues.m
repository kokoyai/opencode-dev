function [residues, residue_map] = detect_residues(phi_wrapped)
% detect_residues - Detect residue points (poles) in wrapped phase
%
% Args:
%   phi_wrapped - Wrapped phase (radians)
%
% Returns:
%   residues - Nx3 matrix: [row, col, charge] where charge is +1 or -1
%   residue_map - Map of residues (+1 for positive, -1 for negative, 0 otherwise)

    [nr, nc] = size(phi_wrapped);
    residue_map = zeros(nr, nc);
    
    for r = 1:nr-1
        for c = 1:nc-1
            d1 = wrap_to_pi(phi_wrapped(r, c+1) - phi_wrapped(r, c));
            d2 = wrap_to_pi(phi_wrapped(r+1, c+1) - phi_wrapped(r, c+1));
            d3 = wrap_to_pi(phi_wrapped(r+1, c) - phi_wrapped(r+1, c+1));
            d4 = wrap_to_pi(phi_wrapped(r, c) - phi_wrapped(r+1, c));
            
            total = d1 + d2 + d3 + d4;
            
            if total > pi
                residue_map(r, c) = 1;
            elseif total < -pi
                residue_map(r, c) = -1;
            end
        end
    end
    
    [rows, cols] = find(residue_map ~= 0);
    charges = residue_map(sub2ind(size(residue_map), rows, cols));
    residues = [rows, cols, charges(:)];
    
end
