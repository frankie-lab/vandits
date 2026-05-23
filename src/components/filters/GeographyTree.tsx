import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Globe2, Flag, MapPin, Building2, Home, Landmark, Info, Milestone, Sparkles, Square } from 'lucide-react';
import { useLocationsStore } from '@/domains/content';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from '@/components/ui/tooltip';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { getLocationHierarchy, getFilledLocationHierarchy, UNCLASSIFIED_VALUE, HIERARCHY_LEVELS, LEVEL_PLACEHOLDER_LABELS, compareGeoTreeNodes, type HierarchyLevel } from '@/shared/geography/hierarchy';
import { hasProvincia, regionHasNoProvincia } from '@/shared/geography/territorial-canon';
import { nameToIso2 } from '@/shared/geo/country-iso';
import { useScopedLocations } from '@/components/filters/UniverseBaseContext';


export type TreeLevel = 'continent' | 'country' | 'region' | 'zone' | 'comarca' | 'localidad' | 'sublocalidad' | 'calle';

export interface TreeNode {
 name: string;
 count: number;
 totalCount: number;
 level: TreeLevel;
 children: TreeNode[];
 path: string[];
 ids: string[];
}

/**
 * T2A-wire — Colapsa el nivel Provincia en países con `hasProvincia=false`.
 *
 * Estructura del árbol: continent(0) → country(1) → region(2) → zone(3) →
 * admin3(4) → locality(5) → sublocality(6) → street(7).
 *
 * Para países §1 sin provincia, los nodos `zone` que cuelgan de cada
 * `region` son TODOS placeholder `(sin provincia)` (regla
 * `getLocationHierarchy`). Este collapse sustituye `region.children` (zones)
 * por sus nietos (admin3/locality/...), reescribiendo paths para omitir el
 * segmento zone. Las regiones se preservan.
 *
 * Itera a nivel REGIÓN — NO a nivel país. País desconocido = no-op.
 * Tree multi-país queda con jerarquía mixta (algunos países muestran
 * Provincia, otros no), exactamente como el canon exige.
 */
export function stripZoneSegmentFromPaths(node: TreeNode, countryPathLen: number): TreeNode {
  // Path indexing: continent(0), country(1) → countryPathLen=2; region(2),
  // zone(3). Quita el índice `countryPathLen + 1` = posición de zone.
  const zoneIdx = countryPathLen + 1;
  const newPath = node.path.length > zoneIdx
    ? [...node.path.slice(0, zoneIdx), ...node.path.slice(zoneIdx + 1)]
    : node.path;
  return {
    ...node,
    path: newPath,
    children: node.children.map((c) => stripZoneSegmentFromPaths(c, countryPathLen)),
  };
}

export function collapseZoneForCountriesWithoutProvincia(nodes: TreeNode[]): void {
  for (const continentNode of nodes) {
    for (const countryNode of continentNode.children) {
      const iso2 = nameToIso2(countryNode.name);
      if (!iso2) continue;
      if (hasProvincia(iso2)) continue;
      // Para cada región del país, sustituye sus hijos zone (placeholder)
      // por los nietos (admin3/locality/...), con paths reescritos.
      for (const regionNode of countryNode.children) {
        const promoted: TreeNode[] = [];
        for (const zoneNode of regionNode.children) {
          for (const grandchild of zoneNode.children) {
            promoted.push(stripZoneSegmentFromPaths(grandchild, countryNode.path.length));
          }
        }
        regionNode.children = promoted.sort(compareGeoTreeNodes);
      }
    }
  }
}

/**
 * T2A-wire (§1.b) — Colapso del nivel Provincia para regiones declaradas
 * SIN provincia/distrito dentro de un país que en general sí tiene provincia
 * (caso PT-20 Açores, PT-30 Madeira).
 *
 * `regionIsoIndex` mapea `regionLabel` (texto que se ve en el árbol, derivado
 * de `regionResolved`/`region`) → `regionIsoCode` (`PT-20`, `PT-30`, ...).
 * Se construye fuera de aquí desde `filteredLocations` para no hardcodear
 * nombres en el componente.
 *
 * Para cada región cuyo iso_code está en `regionsWithoutProvincia` del
 * `CountryCanon`, sustituye `region.children` (zones placeholder o legacy)
 * por sus nietos (admin3/locality/...), reescribiendo paths con
 * `stripZoneSegmentFromPaths`. País desconocido / región sin iso_code = no-op.
 *
 * Se invoca DESPUÉS de `collapseZoneForCountriesWithoutProvincia`.
 */
export function collapseZoneForRegionsWithoutProvincia(
  nodes: TreeNode[],
  regionIsoIndex: ReadonlyMap<string, string>,
): void {
  for (const continentNode of nodes) {
    for (const countryNode of continentNode.children) {
      const iso2 = nameToIso2(countryNode.name);
      if (!iso2) continue;
      for (const regionNode of countryNode.children) {
        // Indexamos por `country/region` para evitar colisiones de nombre
        // entre países distintos (p.ej. "Norte" puede existir en múltiples).
        const key = `${countryNode.name}/${regionNode.name}`;
        const regionIso = regionIsoIndex.get(key);
        if (!regionHasNoProvincia(iso2, regionIso)) continue;
        const promoted: TreeNode[] = [];
        for (const zoneNode of regionNode.children) {
          for (const grandchild of zoneNode.children) {
            promoted.push(stripZoneSegmentFromPaths(grandchild, countryNode.path.length));
          }
        }
        regionNode.children = promoted.sort(compareGeoTreeNodes);
      }
    }
  }
}

export function GeographyTree() {
 const { getAllLocations, filters, setFilters, selectedLocations, navigateToGeoNode, toggleGeoBranchSelection } = useLocationsStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const allLocations = getAllLocations();
  const totalUnclassified = useMemo(
    () => allLocations.filter((l) => {
      const h = getLocationHierarchy(l);
      return !h.continent || !h.country;
    }).length,
    [allLocations],
  );


  // Check if there are non-geography filters active
 const hasNonGeoFilters = useMemo(() => {
 return !!(filters.searchTerm || filters.placeType || filters.tag || filters.onlyEnriched || filters.verified !== undefined);
 }, [filters]);

  // Mapeo HierarchyLevel canónico → TreeLevel local del componente
 const LEVEL_MAP: Record<HierarchyLevel, TreeLevel> = {
 continent: 'continent',
 country: 'country',
 region: 'region',
 zone: 'zone',
 admin_level_3: 'comarca',
 locality: 'localidad',
 sublocality: 'sublocalidad',
 street: 'calle',
 };

  // Build tree from ALL locations (for total counts)
 const totalTree = useMemo(() => {
 if (allLocations.length === 0) return new Map<string, number>();

 const counts = new Map<string, number>();

 allLocations.forEach(loc => {
 const h = getFilledLocationHierarchy(loc);
 // Cuenta acumulada por nivel: el padre cuenta TODOS los descendientes,
 // incluidos los que cuelgan de un placeholder `(sin ...)`.
 let key = '';
 for (const lv of HIERARCHY_LEVELS) {
 key = key ? `${key}/${h[lv]}` : h[lv];
 counts.set(key, (counts.get(key) || 0) + 1);
 }
 });

 return counts;
 }, [allLocations]);

  // Get locations filtered by non-geography filters
 const filteredLocations = useMemo(() => {
 if (allLocations.length === 0) return [];

  return allLocations.filter((loc) => matchesLocationFilters(loc, filters, { includeGeo: false }));
 }, [allLocations, filters]);

  // Build hierarchical tree from filtered locations
 const tree = useMemo(() => {
 if (filteredLocations.length === 0) return [];

 const nodes: TreeNode[] = [];
 const continentMap = new Map<string, TreeNode>();
 // T2A-wire (§1.b) — Índice `country/regionLabel → regionIsoCode` para que
 // el colapso regional sea data-driven (sin hardcodear PT-20/PT-30/Açores).
 // Llave compuesta evita colisiones de nombre entre países (p.ej. "Norte").
 const regionIsoIndex = new Map<string, string>();

 filteredLocations.forEach(loc => {
 // Path COMPLETO de 8 niveles, con placeholders canónicos para los
 // niveles ausentes. Esto garantiza padre = suma(hijos).
 const h = getFilledLocationHierarchy(loc);
 if (loc.regionIsoCode && h.country && h.region) {
 regionIsoIndex.set(`${h.country}/${h.region}`, loc.regionIsoCode);
 }

 let parentChildren = nodes;
 const accumPath: string[] = [];
 let parentMap: Map<string, TreeNode> | null = continentMap;

 for (let i = 0; i < HIERARCHY_LEVELS.length; i++) {
 const hierarchyLevel = HIERARCHY_LEVELS[i];
 const value = h[hierarchyLevel];
 accumPath.push(value);
 const treeLevel = LEVEL_MAP[hierarchyLevel];
 const fullKey = accumPath.join('/');

 // Lookup directo en el primer nivel (continentMap), búsqueda lineal en
 // niveles internos (típicamente pocos hijos por nodo).
 let node: TreeNode | undefined;
 if (i === 0 && parentMap) {
 node = parentMap.get(value);
 } else {
 node = parentChildren.find((c) => c.name === value);
 }

 if (!node) {
 node = {
 name: value,
 count: 0,
 totalCount: totalTree.get(fullKey) || 0,
 level: treeLevel,
 children: [],
 path: [...accumPath],
 ids: [],
 };
 parentChildren.push(node);
 if (i === 0 && parentMap) parentMap.set(value, node);
 }
 node.count++;
 node.ids.push(loc.id);
 parentChildren = node.children;
 parentMap = null;
 }
 });

     // Orden canónico único para árboles geo: A→Z con placeholders al final.
     // No ordenar por count u otros criterios — ver compareGeoTreeNodes.
  const sortNodes = (nodeList: TreeNode[]) => {
  nodeList.sort(compareGeoTreeNodes);
  nodeList.forEach(n => sortNodes(n.children));
  };
  sortNodes(nodes);

  // T2A-wire — colapso del nivel Provincia en países con hasProvincia=false.
  // Recorre los nodos `country` y, si el ISO2 del país no admite provincia
  // canónica, sustituye los hijos zone (todos placeholder tras la regla del
  // canon en hierarchy.ts) por sus nietos. El invariante padre=Σ(hijos) se
  // mantiene porque la zona placeholder agrupa el 100% de los puntos.
  collapseZoneForCountriesWithoutProvincia(nodes);

  // T2A-wire (§1.b) — Después del colapso por país, colapsa también el
  // nivel zone bajo regiones declaradas SIN provincia/distrito (PT-20
  // Açores, PT-30 Madeira). Data-driven vía `regionIsoIndex` +
  // `regionHasNoProvincia` — sin literales en este componente.
  collapseZoneForRegionsWithoutProvincia(nodes, regionIsoIndex);

  return nodes;
  }, [filteredLocations, totalTree]);

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
 
     // Clear all geographic filters first
 newFilters.continent = undefined;
 newFilters.country = undefined;
 newFilters.region = undefined;
 newFilters.zone = undefined;
 newFilters.comarca = undefined;
 newFilters.localidad = undefined;
 newFilters.sublocalidad = undefined;
 (newFilters as any).street = undefined;
 
 if (node.path[0] === '__unclassified__') {
 newFilters.continent = '__unclassified__';
 } else {
       // Set filters based on path
 if (node.path[0]) newFilters.continent = node.path[0];
 if (node.path[1]) newFilters.country = node.path[1];
 if (node.path[2]) newFilters.region = node.path[2];
 if (node.path[3]) newFilters.zone = node.path[3];
 if (node.path[4]) newFilters.comarca = node.path[4];
 if (node.path[5]) newFilters.localidad = node.path[5];
 if (node.path[6]) newFilters.sublocalidad = node.path[6];
 if (node.path[7]) (newFilters as any).street = node.path[7];
 }
 
  navigateToGeoNode(newFilters);
 
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
 if (node.path[0] === '__unclassified__') {
 return filters.continent === '__unclassified__';
 }
 
 const pathLength = node.path.length;
 const filterPath = [
 filters.continent, filters.country, filters.region, 
 filters.zone, filters.comarca, filters.localidad, filters.sublocalidad,
 (filters as any).street,
 ].filter(Boolean);
 
     // Selected if path matches exactly and it's the deepest selected level
 if (filterPath.length !== pathLength) return false;
 return node.path.every((p, i) => filterPath[i] === p);
 };

 const isInPath = (node: TreeNode) => {
 if (node.path[0] === '__unclassified__') {
 return filters.continent === '__unclassified__';
 }
 
 const filterPath = [
 filters.continent, filters.country, filters.region, 
 filters.zone, filters.comarca, filters.localidad, filters.sublocalidad,
 (filters as any).street,
 ].filter(Boolean);
 
     // In path if all node path elements match filter path
 return node.path.every((p, i) => filterPath[i] === p);
 };

 const getLevelIcon = (level: TreeLevel) => {
 switch (level) {
 case 'continent': return <Globe2 className="w-4 h-4 text-blue-500" />;
 case 'country': return <Flag className="w-4 h-4 text-green-500" />;
 case 'region': return <MapPin className="w-4 h-4 text-orange-500" />;
 case 'zone': return <Building2 className="w-4 h-4 text-purple-500" />;
 case 'comarca': return <Landmark className="w-4 h-4 text-teal-500" />;
 case 'localidad': return <Home className="w-4 h-4 text-rose-500" />;
 case 'sublocalidad': return <MapPin className="w-4 h-4 text-muted-foreground" />;
 case 'calle': return <Milestone className="w-4 h-4 text-slate-500" />;
 }
 };

 const getLevelLabel = (level: TreeLevel) => {
 switch (level) {
 case 'continent': return 'Continente';
 case 'country': return 'País';
 case 'region': return 'Región';
 case 'zone': return 'Provincia';
 case 'comarca': return 'Comarca';
 case 'localidad': return 'Localidad';
 case 'sublocalidad': return 'Barrio';
 case 'calle': return 'Calle';
 }
 };

 const renderNode = (node: TreeNode, depth: number = 0) => {
 const pathKey = node.path.join('/');
 const isExpanded = expandedNodes.has(pathKey);
 const hasChildren = node.children.length > 0;
 const selected = isSelected(node);
 const inPath = isInPath(node);
 const isFiltered = hasNonGeoFilters && node.count < node.totalCount;

 const ids = node.ids;
 const selectedInBranch = ids.reduce((acc, id) => acc + (selectedLocations.has(id) ? 1 : 0), 0);
 const allSelected = ids.length > 0 && selectedInBranch === ids.length;
 const someSelected = selectedInBranch > 0 && !allSelected;

 return (
 <div key={pathKey} className="w-full min-w-0 max-w-full overflow-hidden">
 <div
  className={cn(
 "flex items-center gap-1.5 py-1.5 px-2 pr-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors w-full min-w-0 max-w-full box-border overflow-hidden",
 selected && "bg-primary/10 text-primary font-medium ring-1 ring-primary/30",
 inPath && !selected && "text-primary/80"
 )}
 style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
 <ChevronDown className="w-3 h-3 text-muted-foreground" />
 ) : (
 <ChevronRight className="w-3 h-3 text-muted-foreground" />
 )}
 </button>
 ) : (
 <span className="w-4" />
 )}

 {ids.length > 0 && (
 <Checkbox
 checked={allSelected ? true : someSelected ? 'indeterminate' : false}
   onCheckedChange={(v) => {
   toggleGeoBranchSelection(ids, !!v);
   }}
 onClick={(e) => e.stopPropagation()}
 className="h-3.5 w-3.5 shrink-0"
 aria-label={`Seleccionar ${node.name}`}
 />
 )}

 
  <button
 onClick={() => selectNode(node)}
   className="flex items-center gap-1.5 flex-1 w-0 min-w-0 max-w-full overflow-hidden text-left"
 >
  <span className="shrink-0">{getLevelIcon(node.level)}</span>
  <span
    className={cn(
      "block truncate min-w-0 flex-1 text-xs",
      /^\(sin /i.test(node.name) && "italic text-muted-foreground/70",
    )}
    title={/^\(sin /i.test(node.name) ? `${node.name} — nivel sin datos en este punto` : undefined}
  >
    {node.name}
  </span>
 </button>

 <Tooltip>
 <TooltipTrigger asChild>
 <Badge
 variant="secondary"
 className={cn(
 "ml-auto text-[10px] px-1.5 py-0 h-4 font-semibold min-w-[24px] text-center border-0 shrink-0 tabular-nums",
 isFiltered
 ? "bg-amber-100 text-amber-700"
 : "bg-primary/15 text-primary"
 )}
 >
 {isFiltered ? (
 <span>{node.count}<span className="opacity-70">/{node.totalCount}</span></span>
 ) : (
 node.count
 )}
 </Badge>
 </TooltipTrigger>
 <TooltipContent side="left" className="text-xs">
 <div className="font-medium">{getLevelLabel(node.level)}</div>
 {isFiltered && (
 <div>{node.count} de {node.totalCount} coinciden con filtros</div>
 )}
 </TooltipContent>
 </Tooltip>
 </div>
 
  {isExpanded && hasChildren && (
  <div className="w-full min-w-0 max-w-full overflow-hidden">
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
 filters.comarca,
 filters.localidad,
 filters.sublocalidad,
 ].filter(Boolean);

 if (allLocations.length === 0) {
 return (
 <div className="text-sm text-muted-foreground text-center py-4">
 No hay ubicaciones cargadas
 </div>
 );
 }

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
 <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden space-y-2">


 {hasNonGeoFilters && (
 <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1.5">
 <Info className="w-3.5 h-3.5 shrink-0" />
 <span>Conteos filtrados por etiquetas/búsqueda</span>
 </div>
 )}

 {currentPath.length > 0 && (
 <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap bg-muted/30 rounded-md px-2 py-1.5">
 <button
 onClick={() => setFilters({ 
 ...filters, 
 continent: undefined, country: undefined, region: undefined, 
 zone: undefined, comarca: undefined, localidad: undefined, sublocalidad: undefined 
 })}
 className="hover:text-foreground font-medium"
 >
 Todos
 </button>
 {currentPath.map((item, idx) => (
 <React.Fragment key={idx}>
 <span className="text-muted-foreground/50">›</span>
 <button
 onClick={() => {
 const newFilters = { ...filters };
                  // Clear levels below clicked one
 const levels = ['continent', 'country', 'region', 'zone', 'comarca', 'localidad', 'sublocalidad'] as const;
 for (let i = idx + 1; i < levels.length; i++) {
 newFilters[levels[i]] = undefined;
 }
 setFilters(newFilters);
 }}
 className={cn(
 "hover:text-foreground truncate max-w-[80px]",
 idx === currentPath.length - 1 && "text-primary font-medium"
 )}
 title={item}
 >
 {item}
 </button>
 </React.Fragment>
 ))}
 </div>
 )}
 
  <ScrollArea className="flex-1 min-h-[180px] min-w-0">
 <div className="pr-2 space-y-0.5 min-w-0">
 {tree.map(node => renderNode(node))}
 </div>
 </ScrollArea>
 </div>
 );
}
