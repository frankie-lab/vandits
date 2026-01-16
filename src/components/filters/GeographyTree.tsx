import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Globe2, Flag, MapPin, Building2, Info } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TreeNode {
  name: string;
  count: number;
  totalCount: number; // Count without non-geo filters
  level: 'continent' | 'country' | 'region' | 'zone';
  children: TreeNode[];
  path: string[];
}

export function GeographyTree() {
  const { selectedDocument, filters, setFilters } = useLocationsStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Check if there are non-geography filters active
  const hasNonGeoFilters = useMemo(() => {
    return !!(filters.searchTerm || filters.placeType || filters.tag || filters.onlyEnriched || filters.verified !== undefined);
  }, [filters]);

  // Build tree from ALL locations (for total counts)
  const totalTree = useMemo(() => {
    if (!selectedDocument) return new Map<string, number>();
    
    const counts = new Map<string, number>();
    
    selectedDocument.locations.forEach(loc => {
      if (loc.continent) {
        const key = loc.continent;
        counts.set(key, (counts.get(key) || 0) + 1);
        
        if (loc.country) {
          const countryKey = `${loc.continent}/${loc.country}`;
          counts.set(countryKey, (counts.get(countryKey) || 0) + 1);
          
          if (loc.region) {
            const regionKey = `${loc.continent}/${loc.country}/${loc.region}`;
            counts.set(regionKey, (counts.get(regionKey) || 0) + 1);
            
            if (loc.zone) {
              const zoneKey = `${loc.continent}/${loc.country}/${loc.region}/${loc.zone}`;
              counts.set(zoneKey, (counts.get(zoneKey) || 0) + 1);
            }
          }
        }
      }
    });
    
    return counts;
  }, [selectedDocument]);

  // Get locations filtered by non-geography filters
  const filteredLocations = useMemo(() => {
    if (!selectedDocument) return [];
    
    return selectedDocument.locations.filter(loc => {
      const { searchTerm, placeType, tag, onlyEnriched, verified } = filters;
      
      if (placeType && loc.placeType !== placeType) return false;
      if (onlyEnriched && !loc.enrichedData) return false;
      if (verified !== undefined && loc.enrichedData?.verified !== verified) return false;
      
      if (tag && loc.enrichedData?.etiquetas) {
        const hasTags = loc.enrichedData.etiquetas.some(t => 
          t.toLowerCase().replace('#', '') === tag.toLowerCase().replace('#', '')
        );
        if (!hasTags) return false;
      } else if (tag) {
        return false;
      }
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesName = loc.name.toLowerCase().includes(search);
        const matchesDesc = loc.description?.toLowerCase().includes(search);
        const matchesEnrichedName = loc.enrichedData?.nombre_lugar?.toLowerCase().includes(search);
        const matchesEnrichedDesc = loc.enrichedData?.descripcion?.toLowerCase().includes(search);
        const matchesTags = loc.enrichedData?.etiquetas?.some(t => t.toLowerCase().includes(search));
        
        if (!matchesName && !matchesDesc && !matchesEnrichedName && !matchesEnrichedDesc && !matchesTags) return false;
      }
      
      return true;
    });
  }, [selectedDocument, filters]);

  // Build hierarchical tree from filtered locations
  const tree = useMemo(() => {
    if (filteredLocations.length === 0) return [];

    const nodes: TreeNode[] = [];
    const continentMap = new Map<string, TreeNode>();
    let unclassifiedCount = 0;
    let unclassifiedTotal = 0;

    // Count total unclassified in full dataset
    selectedDocument?.locations.forEach(loc => {
      if (!loc.continent || !loc.country) {
        unclassifiedTotal++;
      }
    });

    filteredLocations.forEach(loc => {
      const continent = loc.continent;
      const country = loc.country;
      const region = loc.region;
      const zone = loc.zone;

      // Track locations without complete geographic data
      if (!continent || !country) {
        unclassifiedCount++;
        return;
      }

      // Get or create continent node
      if (!continentMap.has(continent)) {
        continentMap.set(continent, {
          name: continent,
          count: 0,
          totalCount: totalTree.get(continent) || 0,
          level: 'continent',
          children: [],
          path: [continent],
        });
        nodes.push(continentMap.get(continent)!);
      }
      const continentNode = continentMap.get(continent)!;
      continentNode.count++;

      let countryNode = continentNode.children.find(c => c.name === country);
      if (!countryNode) {
        const countryKey = `${continent}/${country}`;
        countryNode = {
          name: country,
          count: 0,
          totalCount: totalTree.get(countryKey) || 0,
          level: 'country',
          children: [],
          path: [continent, country],
        };
        continentNode.children.push(countryNode);
      }
      countryNode.count++;

      if (!region) return;
      
      let regionNode = countryNode.children.find(r => r.name === region);
      if (!regionNode) {
        const regionKey = `${continent}/${country}/${region}`;
        regionNode = {
          name: region,
          count: 0,
          totalCount: totalTree.get(regionKey) || 0,
          level: 'region',
          children: [],
          path: [continent, country, region],
        };
        countryNode.children.push(regionNode);
      }
      regionNode.count++;

      if (!zone) return;
      
      let zoneNode = regionNode.children.find(z => z.name === zone);
      if (!zoneNode) {
        const zoneKey = `${continent}/${country}/${region}/${zone}`;
        zoneNode = {
          name: zone,
          count: 0,
          totalCount: totalTree.get(zoneKey) || 0,
          level: 'zone',
          children: [],
          path: [continent, country, region, zone],
        };
        regionNode.children.push(zoneNode);
      }
      zoneNode.count++;
    });

    // Sort all levels by count (descending), then name
    const sortNodes = (nodeList: TreeNode[]) => {
      nodeList.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      nodeList.forEach(n => sortNodes(n.children));
    };
    sortNodes(nodes);

    // Add "Sin clasificar" node at the end if there are unclassified locations
    if (unclassifiedCount > 0) {
      nodes.push({
        name: '⚠️ Sin clasificar',
        count: unclassifiedCount,
        totalCount: unclassifiedTotal,
        level: 'continent',
        children: [],
        path: ['__unclassified__'],
      });
    }

    return nodes;
  }, [filteredLocations, totalTree, selectedDocument]);

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  const selectNode = (node: TreeNode) => {
    const newFilters = { ...filters };
    
    // Handle "Sin clasificar" special node
    if (node.path[0] === '__unclassified__') {
      newFilters.continent = '__unclassified__';
      newFilters.country = undefined;
      newFilters.region = undefined;
      newFilters.zone = undefined;
    } else if (node.level === 'continent') {
      newFilters.continent = node.name;
      newFilters.country = undefined;
      newFilters.region = undefined;
      newFilters.zone = undefined;
    } else if (node.level === 'country') {
      newFilters.continent = node.path[0];
      newFilters.country = node.name;
      newFilters.region = undefined;
      newFilters.zone = undefined;
    } else if (node.level === 'region') {
      newFilters.continent = node.path[0];
      newFilters.country = node.path[1];
      newFilters.region = node.name;
      newFilters.zone = undefined;
    } else if (node.level === 'zone') {
      newFilters.continent = node.path[0];
      newFilters.country = node.path[1];
      newFilters.region = node.path[2];
      newFilters.zone = node.name;
    }
    
    setFilters(newFilters);
    
    // Auto-expand parent nodes
    const pathKey = node.path.join('/');
    if (!expandedNodes.has(pathKey)) {
      const newExpanded = new Set(expandedNodes);
      for (let i = 1; i <= node.path.length; i++) {
        newExpanded.add(node.path.slice(0, i).join('/'));
      }
      setExpandedNodes(newExpanded);
    }
  };

  const isSelected = (node: TreeNode) => {
    // Handle special "Sin clasificar" node
    if (node.path[0] === '__unclassified__') {
      return filters.continent === '__unclassified__';
    }
    if (node.level === 'continent') return filters.continent === node.name && !filters.country;
    if (node.level === 'country') return filters.country === node.name && !filters.region;
    if (node.level === 'region') return filters.region === node.name && !filters.zone;
    if (node.level === 'zone') return filters.zone === node.name;
    return false;
  };

  const isInPath = (node: TreeNode) => {
    if (node.path[0] === '__unclassified__') {
      return filters.continent === '__unclassified__';
    }
    if (node.level === 'continent') return filters.continent === node.name;
    if (node.level === 'country') return filters.continent === node.path[0] && filters.country === node.name;
    if (node.level === 'region') return filters.country === node.path[1] && filters.region === node.name;
    if (node.level === 'zone') return filters.region === node.path[2] && filters.zone === node.name;
    return false;
  };

  const getLevelIcon = (level: TreeNode['level']) => {
    switch (level) {
      case 'continent': return <Globe2 className="w-4 h-4 text-blue-500" />;
      case 'country': return <Flag className="w-4 h-4 text-green-500" />;
      case 'region': return <MapPin className="w-4 h-4 text-orange-500" />;
      case 'zone': return <Building2 className="w-4 h-4 text-purple-500" />;
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const pathKey = node.path.join('/');
    const isExpanded = expandedNodes.has(pathKey);
    const hasChildren = node.children.length > 0;
    const selected = isSelected(node);
    const inPath = isInPath(node);
    const isFiltered = hasNonGeoFilters && node.count < node.totalCount;

    return (
      <div key={pathKey}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
            selected && "bg-primary/10 text-primary font-medium ring-1 ring-primary/30",
            inPath && !selected && "text-primary/80"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(pathKey);
              }}
              className="p-0.5 hover:bg-muted rounded shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          
          <button
            onClick={() => selectNode(node)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            {getLevelIcon(node.level)}
            <span className="truncate flex-1 text-sm">{node.name}</span>
            
            {/* Show count with total when filtered */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs px-2 py-0.5 h-5 font-semibold min-w-[28px] text-center border-0 mr-1",
                    isFiltered 
                      ? "bg-amber-100 text-amber-700" 
                      : "bg-primary/15 text-primary"
                  )}
                >
                  {isFiltered ? (
                    <span>{node.count}<span className="text-[10px] font-normal opacity-70">/{node.totalCount}</span></span>
                  ) : (
                    node.count
                  )}
                </Badge>
              </TooltipTrigger>
              {isFiltered && (
                <TooltipContent side="left" className="text-xs">
                  {node.count} de {node.totalCount} coinciden con los filtros activos
                </TooltipContent>
              )}
            </Tooltip>
          </button>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Current selection breadcrumb
  const currentPath = [
    filters.continent,
    filters.country,
    filters.region,
    filters.zone,
  ].filter(Boolean);

  if (!selectedDocument) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No hay documento seleccionado
      </div>
    );
  }

  // Show info when no results match filters
  if (tree.length === 0 && hasNonGeoFilters) {
    return (
      <div className="text-sm text-center py-4 space-y-2">
        <div className="text-muted-foreground">
          No hay ubicaciones que coincidan con los filtros activos
        </div>
        <button
          onClick={() => setFilters({})}
          className="text-primary text-xs hover:underline"
        >
          Quitar todos los filtros
        </button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No hay datos geográficos
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Info banner when filters affect counts */}
      {hasNonGeoFilters && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Los conteos reflejan los filtros activos (etiquetas, búsqueda, etc.)</span>
        </div>
      )}

      {/* Breadcrumb */}
      {currentPath.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap bg-muted/30 rounded-md px-2 py-1.5">
          <button
            onClick={() => setFilters({ ...filters, continent: undefined, country: undefined, region: undefined, zone: undefined })}
            className="hover:text-foreground font-medium"
          >
            🌍 Todos
          </button>
          {currentPath.map((item, idx) => (
            <React.Fragment key={idx}>
              <span className="text-muted-foreground/50">›</span>
              <button
                onClick={() => {
                  const newFilters = { ...filters };
                  if (idx === 0) {
                    newFilters.country = undefined;
                    newFilters.region = undefined;
                    newFilters.zone = undefined;
                  } else if (idx === 1) {
                    newFilters.region = undefined;
                    newFilters.zone = undefined;
                  } else if (idx === 2) {
                    newFilters.zone = undefined;
                  }
                  setFilters(newFilters);
                }}
                className={cn(
                  "hover:text-foreground",
                  idx === currentPath.length - 1 && "text-primary font-medium"
                )}
              >
                {item}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
      
      <ScrollArea className="h-[200px]">
        <div className="pr-2 space-y-0.5">
          {tree.map(node => renderNode(node))}
        </div>
      </ScrollArea>
    </div>
  );
}