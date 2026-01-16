import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Globe2, Flag, MapPin, Building2, Layers } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface TreeNode {
  name: string;
  count: number;
  level: 'continent' | 'country' | 'region' | 'zone';
  children: TreeNode[];
  path: string[];
}

export function GeographyTree() {
  const { selectedDocument, filters, setFilters } = useLocationsStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build hierarchical tree from locations - only include real data (skip nulls)
  const tree = useMemo(() => {
    if (!selectedDocument) return [];

    const nodes: TreeNode[] = [];
    const continentMap = new Map<string, TreeNode>();

    selectedDocument.locations.forEach(loc => {
      const continent = loc.continent;
      const country = loc.country;
      const region = loc.region;
      const zone = loc.zone;

      // Skip locations without continent
      if (!continent) return;

      // Get or create continent node
      if (!continentMap.has(continent)) {
        continentMap.set(continent, {
          name: continent,
          count: 0,
          level: 'continent',
          children: [],
          path: [continent],
        });
        nodes.push(continentMap.get(continent)!);
      }
      const continentNode = continentMap.get(continent)!;
      continentNode.count++;

      // Only create country node if country exists
      if (!country) return;
      
      let countryNode = continentNode.children.find(c => c.name === country);
      if (!countryNode) {
        countryNode = {
          name: country,
          count: 0,
          level: 'country',
          children: [],
          path: [continent, country],
        };
        continentNode.children.push(countryNode);
      }
      countryNode.count++;

      // Only create region node if region exists
      if (!region) return;
      
      let regionNode = countryNode.children.find(r => r.name === region);
      if (!regionNode) {
        regionNode = {
          name: region,
          count: 0,
          level: 'region',
          children: [],
          path: [continent, country, region],
        };
        countryNode.children.push(regionNode);
      }
      regionNode.count++;

      // Only create zone node if zone exists
      if (!zone) return;
      
      let zoneNode = regionNode.children.find(z => z.name === zone);
      if (!zoneNode) {
        zoneNode = {
          name: zone,
          count: 0,
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

    return nodes;
  }, [selectedDocument]);

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
    
    // Clear lower levels when selecting a higher level
    if (node.level === 'continent') {
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
      // Add all parent paths
      for (let i = 1; i <= node.path.length; i++) {
        newExpanded.add(node.path.slice(0, i).join('/'));
      }
      setExpandedNodes(newExpanded);
    }
  };

  const isSelected = (node: TreeNode) => {
    if (node.level === 'continent') return filters.continent === node.name && !filters.country;
    if (node.level === 'country') return filters.country === node.name && !filters.region;
    if (node.level === 'region') return filters.region === node.name && !filters.zone;
    if (node.level === 'zone') return filters.zone === node.name;
    return false;
  };

  const isInPath = (node: TreeNode) => {
    if (node.level === 'continent') return filters.continent === node.name;
    if (node.level === 'country') return filters.continent === node.path[0] && filters.country === node.name;
    if (node.level === 'region') return filters.country === node.path[1] && filters.region === node.name;
    if (node.level === 'zone') return filters.region === node.path[2] && filters.zone === node.name;
    return false;
  };

  const getLevelIcon = (level: TreeNode['level']) => {
    switch (level) {
      case 'continent': return <Globe2 className="w-3.5 h-3.5 text-blue-500" />;
      case 'country': return <Flag className="w-3.5 h-3.5 text-green-500" />;
      case 'region': return <MapPin className="w-3.5 h-3.5 text-orange-500" />;
      case 'zone': return <Building2 className="w-3.5 h-3.5 text-purple-500" />;
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const pathKey = node.path.join('/');
    const isExpanded = expandedNodes.has(pathKey);
    const hasChildren = node.children.length > 0;
    const selected = isSelected(node);
    const inPath = isInPath(node);

    return (
      <div key={pathKey}>
        <div
          className={cn(
            "flex items-center gap-1 py-1 px-1 rounded cursor-pointer hover:bg-muted/50 transition-colors",
            selected && "bg-primary/10 text-primary font-medium",
            inPath && !selected && "text-primary/80"
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(pathKey);
              }}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          
          <button
            onClick={() => selectNode(node)}
            className="flex items-center gap-1.5 flex-1 text-left text-sm"
          >
            {getLevelIcon(node.level)}
            <span className="truncate flex-1">{node.name}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              {node.count}
            </Badge>
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

  if (!selectedDocument || tree.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No hay datos geográficos
      </div>
    );
  }

  // Current selection breadcrumb
  const currentPath = [
    filters.continent,
    filters.country,
    filters.region,
    filters.zone,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      {currentPath.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          <button
            onClick={() => setFilters({ ...filters, continent: undefined, country: undefined, region: undefined, zone: undefined })}
            className="hover:text-foreground"
          >
            🌍 Todos
          </button>
          {currentPath.map((item, idx) => (
            <React.Fragment key={idx}>
              <span>›</span>
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
        <div className="pr-2">
          {tree.map(node => renderNode(node))}
        </div>
      </ScrollArea>
    </div>
  );
}