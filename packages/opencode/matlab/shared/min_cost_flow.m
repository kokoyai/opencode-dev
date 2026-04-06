function [flow, cost] = min_cost_flow(capacity, cost_matrix, supply, method)
% min_cost_flow - Solve minimum cost flow problem
%
% Args:
%   capacity - Capacity matrix (n x n)
%   cost_matrix - Cost per unit flow matrix (n x n)
%   supply - Supply/demand vector (positive = supply, negative = demand)
%   method - Solver: 'simplex' (default), 'ssp' (successive shortest path)
%
% Returns:
%   flow - Flow matrix (n x n)
%   cost - Total cost

    if nargin < 4
        method = 'simplex';
    end
    
    n = length(supply);
    
    if sum(supply) > 1e-10
        error('Supply must equal demand (sum to zero)');
    end
    
    switch lower(method)
        case 'simplex'
            [flow, cost] = mcf_simplex(capacity, cost_matrix, supply);
            
        case 'ssp'
            [flow, cost] = mcf_ssp(capacity, cost_matrix, supply);
            
        otherwise
            error('Unknown method: %s', method);
    end
    
end

function [flow, cost] = mcf_simplex(cap, cost_mat, supply)
    n = length(supply);
    flow = zeros(n);
    cost = 0;
    
    residual_supply = supply(:);
    
    max_iter = n * n;
    for iter = 1:max_iter
        sources = find(residual_supply > 1e-10);
        sinks = find(residual_supply < -1e-10);
        
        if isempty(sources) || isempty(sinks)
            break;
        end
        
        best_cost = inf;
        best_src = 1;
        best_sink = 1;
        
        for s = sources'
            for t = sinks'
                if cap(s,t) > 0
                    c = cost_mat(s,t);
                    if c < best_cost
                        best_cost = c;
                        best_src = s;
                        best_sink = t;
                    end
                end
            end
        end
        
        if isinf(best_cost)
            break;
        end
        
        amount = min([residual_supply(best_src), -residual_supply(best_sink), cap(best_src, best_sink)]);
        flow(best_src, best_sink) = flow(best_src, best_sink) + amount;
        residual_supply(best_src) = residual_supply(best_src) - amount;
        residual_supply(best_sink) = residual_supply(best_sink) + amount;
        cap(best_src, best_sink) = cap(best_src, best_sink) - amount;
        cost = cost + amount * best_cost;
    end
end

function [flow, cost] = mcf_ssp(cap, cost_mat, supply)
    n = length(supply);
    flow = zeros(n);
    cost = 0;
    residual_supply = supply(:);
    
    max_iter = n * n;
    for iter = 1:max_iter
        sources = find(residual_supply > 1e-10);
        sinks = find(residual_supply < -1e-10);
        
        if isempty(sources) || isempty(sinks)
            break;
        end
        
        dist = inf(n, 1);
        prev = zeros(n, 1);
        dist(sources(1)) = 0;
        
        for k = 1:n-1
            for i = 1:n
                for j = 1:n
                    if cap(i,j) > flow(i,j) && dist(i) + cost_mat(i,j) < dist(j)
                        dist(j) = dist(i) + cost_mat(i,j);
                        prev(j) = i;
                    end
                end
            end
        end
        
        best_sink = 1;
        best_dist = inf;
        for t = sinks'
            if dist(t) < best_dist
                best_dist = dist(t);
                best_sink = t;
            end
        end
        
        if isinf(best_dist)
            break;
        end
        
        path = best_sink;
        while prev(path(end)) ~= 0
            path = [prev(path(end)), path];
        end
        
        path_flow = min([residual_supply(path(1)), -residual_supply(best_sink)]);
        for k = 1:length(path)-1
            path_flow = min(path_flow, cap(path(k), path(k+1)) - flow(path(k), path(k+1)));
        end
        
        for k = 1:length(path)-1
            flow(path(k), path(k+1)) = flow(path(k), path(k+1)) + path_flow;
            cost = cost + path_flow * cost_mat(path(k), path(k+1));
        end
        
        residual_supply(path(1)) = residual_supply(path(1)) - path_flow;
        residual_supply(best_sink) = residual_supply(best_sink) + path_flow;
    end
end
