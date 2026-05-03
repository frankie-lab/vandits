import React, { useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Globe2, Flag, MapPin, Building2, Home, Landmark, Info, Milestone, Sparkles, Loader2, Square } from 'lucide-react';
import { useLocationsStore } from '@/domains/content';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from '@/components/ui/tooltip';

type TreeLevel = 'continent' | 'country' | 'region' | 'zone' | 'comarca' | 'localidad' | 'sublocalidad' | 'calle';

interface TreeNode {
 name: string;
 count: number;
 totalCount: number;
 level: TreeLevel;
 children: TreeNode[];
 path: string[];
 ids: string[];
}

export function GeographyTree() {
 const { getAllLocations, filters, setFilters, selectedLocations, navigateToGeoNode, toggleGeoBranchSelection } = useLocationsStore();
 const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);
  const cancelRef = useRef(false);

  const allLocations = getAllLocations();
  const totalUnclassified = useMemo(
    () => allLocations.filter(l => !l.country).length,
    [allLocations],
  );

  const stopBackfill = () => {
    cancelRef.current = true;
  };

  const runBackfill = async () => {
    if (backfilling) return;
    cancelRef.current = false;
    setBackfilling(true);
    const t = toast.loading('Geocodificando puntos por coordenadas...');
    try {
      let totalUpdated = 0;
      let remaining = totalUnclassified;
      let failStreak = 0;
      // Bucle hasta acabar TODOS los pendientes. Solo se detiene si:
      //  - remaining === 0
      //  - el usuario pulsa "Detener"
      //  - 5 lotes seguidos con error real (no fallos puntuales de Nominatim)
      while (true) {
        if (cancelRef.current) {
          toast.message(`Detenido por el usuario. Geocodificados ${totalUpdated}, quedan ${remaining}.`, { id: t });
          return;
        }
        const { data, error } = await supabase.functions.invoke('backfill-admin-fks', {
          body: { limit: 50 },
        });
        if (error) {
          failStreak++;
          if (failStreak >= 5) {
            toast.error(`Detenido tras varios errores. Geocodificados ${totalUpdated}, quedan ${remaining}.`, { id: t });
            return;
          }
          continue;
        }
        failStreak = 0;
        const upd = (data as { updated?: number })?.updated ?? 0;
        const failed = (data as { failed?: number })?.failed ?? 0;
        remaining = (data as { remaining?: number })?.remaining ?? 0;
        totalUpdated += upd;
        toast.loading(
          `Geocodificados ${totalUpdated}. Quedan ${remaining}${failed ? ` · ${failed} fallidos este lote` : ''}...`,
          { id: t },
        );
        if (remaining === 0) break;
        // Si no avanzó nada y no quedan, salimos. Si quedan pero ningún punto del lote tenía coords válidas,
        // continuamos: el siguiente lote traerá otros puntos.
        if (upd === 0 && failed === 0) break;
      }
      toast.success(`Geocodificación completada: ${totalUpdated} puntos`, { id: t });
      window.dispatchEvent(new CustomEvent('locations:refresh'));
    } catch (err) {
      console.error('[GeographyTree] backfill failed:', err);
      toast.error('Error al geocodificar puntos', { id: t });
    } finally {
      setBackfilling(false);
      cancelRef.current = false;
    }
  };


  // Check if there are non-geography filters active
 const hasNonGeoFilters = useMemo(() => {
 return !!(filters.searchTerm || filters.placeType || filters.tag || filters.onlyEnriched || filters.verified !== undefined);
 }, [filters]);

  // Build tree from ALL locations (for total counts)
 const totalTree = useMemo(() => {
 if (allLocations.length === 0) return new Map<string, number>();
 
 const counts = new Map<string, number>();
 
 allLocations.forEach(loc => {
 const gd = loc.enrichedData?.datos_geograficos;
 
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
 
              // Extended levels from enrichedData
 const comarca = gd?.admin_nivel_3;
 if (comarca) {
 const comarcaKey = `${loc.continent}/${loc.country}/${loc.region}/${loc.zone}/${comarca}`;
 counts.set(comarcaKey, (counts.get(comarcaKey) || 0) + 1);
 
 const localidad = gd?.localidad;
 if (localidad) {
 const localidadKey = `${comarcaKey}/${localidad}`;
 counts.set(localidadKey, (counts.get(localidadKey) || 0) + 1);
 
 const sublocalidad = gd?.sublocalidad;
 if (sublocalidad) {
 const subKey = `${localidadKey}/${sublocalidad}`;
 counts.set(subKey, (counts.get(subKey) || 0) + 1);

 const calle = (gd as any)?.calle;
 if (calle) {
 const calleKey = `${subKey}/${calle}`;
 counts.set(calleKey, (counts.get(calleKey) || 0) + 1);
 }
 }
 }
 }
 }
 }
 }
 }
 });
 
 return counts;
 }, [allLocations]);

  // Get locations filtered by non-geography filters
 const filteredLocations = useMemo(() => {
 if (allLocations.length === 0) return [];
 
 return allLocations.filter(loc => {
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
 }, [allLocations, filters]);

  // Build hierarchical tree from filtered locations
 const tree = useMemo(() => {
 if (filteredLocations.length === 0) return [];

 const nodes: TreeNode[] = [];
 const continentMap = new Map<string, TreeNode>();
 let unclassifiedCount = 0;
 let unclassifiedTotal = 0;

 allLocations.forEach(loc => {
 if (!loc.continent || !loc.country) {
 unclassifiedTotal++;
 }
 });

 filteredLocations.forEach(loc => {
 const gd = loc.enrichedData?.datos_geograficos;
 const continent = loc.continent;
 const country = loc.country;
 const region = loc.region;
 const zone = loc.zone;
 const comarca = gd?.admin_nivel_3;
 const localidad = gd?.localidad;
 const sublocalidad = gd?.sublocalidad;
 const calle = (gd as any)?.calle as string | undefined;

 if (!continent || !country) {
 unclassifiedCount++;
 return;
 }

      // Continent
 if (!continentMap.has(continent)) {
 continentMap.set(continent, {
 name: continent,
 count: 0,
 totalCount: totalTree.get(continent) || 0,
 level: 'continent',
 children: [],
 path: [continent],
  ids: [],
 });
 nodes.push(continentMap.get(continent)!);
 }
 const continentNode = continentMap.get(continent)!;
 continentNode.count++;
 continentNode.ids.push(loc.id);

      // Country
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
  ids: [],
 };
 continentNode.children.push(countryNode);
 }
 countryNode.count++;
 countryNode.ids.push(loc.id);

 if (!region) return;
 
      // Region
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
  ids: [],
 };
 countryNode.children.push(regionNode);
 }
 regionNode.count++;
 regionNode.ids.push(loc.id);

 if (!zone) return;
 
      // Zone (Provincia)
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
  ids: [],
 };
 regionNode.children.push(zoneNode);
 }
 zoneNode.count++;
 zoneNode.ids.push(loc.id);

 if (!comarca) return;
 
      // Comarca (admin_nivel_3)
 let comarcaNode = zoneNode.children.find(c => c.name === comarca);
 if (!comarcaNode) {
 const comarcaKey = `${continent}/${country}/${region}/${zone}/${comarca}`;
 comarcaNode = {
 name: comarca,
 count: 0,
 totalCount: totalTree.get(comarcaKey) || 0,
 level: 'comarca',
 children: [],
 path: [continent, country, region, zone, comarca],
  ids: [],
 };
 zoneNode.children.push(comarcaNode);
 }
 comarcaNode.count++;
 comarcaNode.ids.push(loc.id);

 if (!localidad) return;
 
      // Localidad
 let localidadNode = comarcaNode.children.find(l => l.name === localidad);
 if (!localidadNode) {
 const localidadKey = `${continent}/${country}/${region}/${zone}/${comarca}/${localidad}`;
 localidadNode = {
 name: localidad,
 count: 0,
 totalCount: totalTree.get(localidadKey) || 0,
 level: 'localidad',
 children: [],
 path: [continent, country, region, zone, comarca, localidad],
  ids: [],
 };
 comarcaNode.children.push(localidadNode);
 }
 localidadNode.count++;
 localidadNode.ids.push(loc.id);

 if (!sublocalidad) return;
 
      // Sublocalidad (Barrio)
 let subNode = localidadNode.children.find(s => s.name === sublocalidad);
 if (!subNode) {
 const subKey = `${continent}/${country}/${region}/${zone}/${comarca}/${localidad}/${sublocalidad}`;
 subNode = {
 name: sublocalidad,
 count: 0,
 totalCount: totalTree.get(subKey) || 0,
 level: 'sublocalidad',
 children: [],
 path: [continent, country, region, zone, comarca, localidad, sublocalidad],
  ids: [],
 };
 localidadNode.children.push(subNode);
 }
 subNode.count++;
 subNode.ids.push(loc.id);

 if (!calle) return;

       // Calle (nivel 8)
 let calleNode = subNode.children.find(c => c.name === calle);
 if (!calleNode) {
 const calleKey = `${continent}/${country}/${region}/${zone}/${comarca}/${localidad}/${sublocalidad}/${calle}`;
 calleNode = {
 name: calle,
 count: 0,
 totalCount: totalTree.get(calleKey) || 0,
 level: 'calle',
 children: [],
 path: [continent, country, region, zone, comarca, localidad, sublocalidad, calle],
  ids: [],
 };
 subNode.children.push(calleNode);
 }
 calleNode.count++;
 calleNode.ids.push(loc.id);
 });

    // Sort all levels
 const sortNodes = (nodeList: TreeNode[]) => {
 nodeList.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
 nodeList.forEach(n => sortNodes(n.children));
 };
 sortNodes(nodes);

    // Add "Sin clasificar" node
 if (unclassifiedCount > 0) {
 const unclassifiedIds = filteredLocations.filter(l => !l.continent || !l.country).map(l => l.id);
 nodes.push({
 name: 'Sin clasificar',
 count: unclassifiedCount,
 totalCount: unclassifiedTotal,
 level: 'continent',
 children: [],
 path: ['__unclassified__'],
  ids: unclassifiedIds,
 });
 }

 return nodes;
 }, [filteredLocations, totalTree, allLocations]);

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
 case 'sublocalidad': return <MapPin className="w-4 h-4 text-gray-500" />;
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
 <div key={pathKey}>
 <div
 className={cn(
 "flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
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
  // Modo selección manual: limpiamos cualquier filtro geográfico de
  // miga para que la selección sea transversal entre países/regiones.
  if (filters.continent || filters.country || filters.region || filters.zone) {
  setFilters({
   ...filters,
   continent: undefined, country: undefined, region: undefined,
   zone: undefined, comarca: undefined, localidad: undefined, sublocalidad: undefined,
  });
  }
  if (v) addLocationsToSelection(ids);
  else removeLocationsFromSelection(ids);
  }}
 onClick={(e) => e.stopPropagation()}
 className="h-3.5 w-3.5 shrink-0"
 aria-label={`Seleccionar ${node.name}`}
 />
 )}

 
 <button
 onClick={() => selectNode(node)}
 className="flex items-center gap-1.5 flex-1 text-left min-w-0"
 >
 {getLevelIcon(node.level)}
 <span className="truncate flex-1 text-xs">{node.name}</span>
 
 <Tooltip>
 <TooltipTrigger asChild>
 <Badge 
 variant="secondary" 
 className={cn(
 "text-[10px] px-1.5 py-0 h-4 font-semibold min-w-[24px] text-center border-0 shrink-0",
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
 <div className="space-y-2">
  {totalUnclassified > 0 && (() => {
   const total = allLocations.length;
   const classified = total - totalUnclassified;
   const pct = total > 0 ? Math.round((classified / total) * 100) : 0;
   return (
   <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-md px-2 py-2">
     <div className="flex items-start justify-between gap-2 text-xs">
      <div className="flex flex-col gap-0.5 text-amber-800 leading-tight">
       <span><strong>{totalUnclassified}</strong> pendientes de geocodificar</span>
       <span><strong>{classified}</strong> geocodificados</span>
      </div>
      <Button
       size="sm"
       variant={backfilling ? 'destructive' : 'outline'}
       className={`h-7 px-2 text-xs gap-1 shrink-0 ${backfilling ? '' : 'bg-white'}`}
       onClick={backfilling ? stopBackfill : runBackfill}
      >
       {backfilling
        ? <><Square className="w-3 h-3" />Detener</>
        : <><Sparkles className="w-3 h-3" />Geocodificar</>}
      </Button>
     </div>
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-amber-200/60">
     <div
      className="h-full bg-emerald-500 transition-all duration-500"
      style={{ width: `${pct}%` }}
     />
    </div>
    <div className="flex justify-between text-[10px] text-amber-700/80">
     <span>{pct}% geocodificados</span>
     <span>{total} totales (independiente de filtros)</span>
    </div>
   </div>
   );
  })()}

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
 
 <ScrollArea className="h-[220px]">
 <div className="pr-2 space-y-0.5">
 {tree.map(node => renderNode(node))}
 </div>
 </ScrollArea>
 </div>
 );
}
