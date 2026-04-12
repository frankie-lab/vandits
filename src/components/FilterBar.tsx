import React, { useState, useCallback, useMemo } from 'react';
import { Search, X, Sparkles, CheckCircle, MapPin, Tag, Building2, Filter, RefreshCw, AlertTriangle, RotateCcw, Layers, MapPinCheck, MapPinOff, Trash2, Loader2 } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { useFilteredLocations, useEnrichedStats } from '@/domains/content/hooks/use-filtered-locations';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { PLACE_TYPE_LABELS, VisitedFilter } from '@/types/location';
import { GeographyTree } from './filters/GeographyTree';
import { TagsTree } from './filters/TagsTree';
import { PlaceTypeFilter } from './filters/PlaceTypeFilter';
import { ClassificationTree } from './filters/ClassificationTree';
import { loadLocationsFromDatabase } from '@/hooks/use-database-sync';
import { toast } from 'sonner';

export function FilterBar() {
  const { 
  filters, 
  setFilters, 
  selectedLocations,
  selectAllLocations,
  clearSelection,
  selectByFilter,
  selectedDocument,
  updateDocumentLocations,
  } = useLocationsStore();
  
  const filteredLocations = useFilteredLocations();
  const stats = useEnrichedStats();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const refreshData = useCallback(async () => {
  if (!selectedDocument) return;
  
  setIsRefreshing(true);
  try {
  const locations = await loadLocationsFromDatabase(selectedDocument.id);
  if (locations.length > 0) {
  updateDocumentLocations(selectedDocument.id, locations);
  toast.success(`${locations.length} ubicaciones actualizadas`);
  }
  } catch (error) {
  console.error('Error refreshing data:', error);
  toast.error('Error al actualizar datos');
  } finally {
  setIsRefreshing(false);
  }
  }, [selectedDocument, updateDocumentLocations]);
 const filteredCount = filteredLocations.length;
 const selectedCount = selectedLocations.size;

  // Handle bulk delete of filtered locations
 const handleBulkDelete = useCallback(async () => {
 if (filteredLocations.length === 0) return;
 
 setIsDeleting(true);
 const toastId = toast.loading(`Eliminando ${filteredLocations.length} ubicaciones...`);
 
 try {
 const locationIds = filteredLocations.map(l => l.id);
 
 const { error } = await supabase
 .from('locations')
 .update({ deleted_at: new Date().toISOString() })
 .in('id', locationIds);
 
 if (error) throw error;
 
  toast.success(`${filteredLocations.length} ubicaciones movidas a la papelera`, { id: toastId });
 
      // Clear filters and refresh data
 setFilters({});
 window.dispatchEvent(new CustomEvent('trash-updated'));
 window.dispatchEvent(new CustomEvent('store-updated'));
 } catch (error) {
 console.error('Bulk delete error:', error);
 toast.error('Error al eliminar ubicaciones', { id: toastId });
 } finally {
 setIsDeleting(false);
 }
 }, [filteredLocations, setFilters]);

  // Categorize active filters
 const activeFilters = useMemo(() => {
 const geographic = filters.continent || filters.country || filters.region || filters.zone || filters.comarca || filters.localidad;
 const thematic = filters.tag || filters.placeType || filters.searchTerm;
 const status = filters.onlyEnriched || filters.verified || filters.enrichmentStatus;
 const classification = filters.classificationCode;
 const visited = filters.visitedFilter && filters.visitedFilter !== 'all';
 
 return {
 geographic,
 thematic,
 status,
 classification,
 visited,
 hasAny: geographic || thematic || status || classification || visited,
 geographyLabel: [filters.continent, filters.country, filters.region, filters.zone, filters.comarca, filters.localidad].filter(Boolean).slice(-2).join(' › '),
 };
 }, [filters]);

 const clearAllFilters = () => {
 setFilters({});
 };

 const clearGeographyFilters = () => {
 setFilters({ ...filters, continent: undefined, country: undefined, region: undefined, zone: undefined, comarca: undefined, localidad: undefined, sublocalidad: undefined });
 };

 const clearThematicFilters = () => {
 setFilters({ ...filters, tag: undefined, placeType: undefined, searchTerm: undefined });
 };

 const clearStatusFilters = () => {
 setFilters({ ...filters, onlyEnriched: undefined, verified: undefined, enrichmentStatus: undefined, visitedFilter: undefined });
 };

  // Check if filters are significantly reducing results
 const filterReductionWarning = stats.total > 0 && filteredCount < stats.total * 0.2 && filteredCount < 50;

 return (
 <div className="space-y-3">
 {/* Stats bar with prominent filter summary */}
 <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg p-3 space-y-2">
 {/* Result count - prominent */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-2xl font-bold text-primary">{filteredCount}</span>
 <span className="text-sm text-muted-foreground">
 {filteredCount === stats.total ? 'ubicaciones' : `de ${stats.total} ubicaciones`}
 </span>
 </div>
 <div className="flex items-center gap-1">
 {activeFilters.hasAny && (
 <Button
 variant="outline"
 size="sm"
 onClick={clearAllFilters}
 className="h-7 px-2 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
 >
 <RotateCcw className="w-3 h-3" />
 Quitar filtros
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={refreshData}
 disabled={isRefreshing}
 className="h-7 px-2"
 >
 <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
 </Button>
 </div>
 </div>

 {/* Warning when filters are very restrictive */}
 {filterReductionWarning && (
 <div className="flex items-center gap-2 text-xs bg-amber-100 text-amber-800 rounded-md px-2 py-1.5">
 <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
 <span>Los filtros activos muestran solo {Math.round(filteredCount/stats.total*100)}% del total</span>
 </div>
 )}

 {/* Stats row */}
 <div className="flex items-center gap-3 text-xs text-muted-foreground">
 <div className="flex items-center gap-1 text-amber-600">
 <Sparkles className="w-3 h-3" />
 <span className="font-medium">{stats.enriched}</span> enriquecidos
 </div>
 {stats.verified > 0 && (
 <div className="flex items-center gap-1 text-green-600">
 <CheckCircle className="w-3 h-3" />
 <span className="font-medium">{stats.verified}</span> verificados
 </div>
 )}
 </div>
 </div>

 {/* Active filters summary - VERY VISIBLE */}
 {activeFilters.hasAny && (
 <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
 <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
 <Filter className="w-3 h-3" />
 Filtros activos:
 </div>
 <div className="flex flex-wrap gap-1.5">
 {activeFilters.geographic && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-blue-100 text-blue-700 text-xs cursor-pointer hover:bg-blue-200"
 onClick={clearGeographyFilters}
 >
 <MapPin className="w-3 h-3" />
 {activeFilters.geographyLabel}
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.tag && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-purple-100 text-purple-700 text-xs cursor-pointer hover:bg-purple-200"
 onClick={() => setFilters({ ...filters, tag: undefined })}
 >
 <Tag className="w-3 h-3" />
 #{filters.tag}
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.placeType && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-orange-100 text-orange-700 text-xs cursor-pointer hover:bg-orange-200"
 onClick={() => setFilters({ ...filters, placeType: undefined })}
 >
 <Building2 className="w-3 h-3" />
 {PLACE_TYPE_LABELS[filters.placeType]}
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.searchTerm && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-gray-100 text-gray-700 text-xs cursor-pointer hover:bg-gray-200"
 onClick={() => setFilters({ ...filters, searchTerm: undefined })}
 >
 <Search className="w-3 h-3" />
 "{filters.searchTerm}"
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.onlyEnriched && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-amber-100 text-amber-700 text-xs cursor-pointer hover:bg-amber-200"
 onClick={clearStatusFilters}
 >
 <Sparkles className="w-3 h-3" />
 Solo enriquecidos
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.verified && (
 <Badge 
 variant="secondary" 
 className="gap-1 pr-1 bg-green-100 text-green-700 text-xs cursor-pointer hover:bg-green-200"
 onClick={() => setFilters({ ...filters, verified: undefined })}
 >
 <CheckCircle className="w-3 h-3" />
 Verificados
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.enrichmentStatus && (
 <Badge 
 variant="secondary" 
 className={`gap-1 pr-1 text-xs cursor-pointer ${
 filters.enrichmentStatus === 'current' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
 filters.enrichmentStatus === 'previous' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
 filters.enrichmentStatus === 'unknown' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
 'bg-red-100 text-red-700 hover:bg-red-200'
 }`}
 onClick={() => setFilters({ ...filters, enrichmentStatus: undefined })}
 >
 <Filter className="w-3 h-3" />
 {filters.enrichmentStatus === 'current' ? 'Final' :
 filters.enrichmentStatus === 'previous' ? 'Pendiente' :
 filters.enrichmentStatus === 'unknown' ? 'Desconocido' : 'Importado'}
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 {filters.visitedFilter && filters.visitedFilter !== 'all' && (
 <Badge 
 variant="secondary" 
 className={`gap-1 pr-1 text-xs cursor-pointer ${
 filters.visitedFilter === 'visited' 
 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
 : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
 }`}
 onClick={() => setFilters({ ...filters, visitedFilter: undefined })}
 >
 {filters.visitedFilter === 'visited' ? <MapPinCheck className="w-3 h-3" /> : <MapPinOff className="w-3 h-3" />}
 {filters.visitedFilter === 'visited' ? 'Visitados' : 'Pendientes'}
 <X className="w-3 h-3 ml-1" />
 </Badge>
 )}
 </div>
 </div>
 )}

 {/* Quick filters - enriched toggle */}
 <div className="flex flex-col gap-2 p-2 bg-muted/30 rounded-lg">
 {/* Row 1: Enriched and Verified toggles */}
 <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
 <div className="flex items-center gap-2">
 <Switch
 id="only-enriched"
 checked={filters.onlyEnriched || false}
 onCheckedChange={(checked) => setFilters({ ...filters, onlyEnriched: checked || undefined })}
 />
 <Label htmlFor="only-enriched" className="text-sm flex items-center gap-1 cursor-pointer whitespace-nowrap">
 <Sparkles className="w-3.5 h-3.5 text-amber-500" />
 Solo enriquecidos
 </Label>
 </div>
 {filters.onlyEnriched && stats.verified > 0 && (
 <div className="flex items-center gap-2">
 <Switch
 id="only-verified"
 checked={filters.verified || false}
 onCheckedChange={(checked) => setFilters({ ...filters, verified: checked || undefined })}
 />
 <Label htmlFor="only-verified" className="text-sm flex items-center gap-1 cursor-pointer whitespace-nowrap">
 <CheckCircle className="w-3.5 h-3.5 text-green-500" />
 Verificados
 </Label>
 </div>
 )}
 </div>
 
 {/* Row 2: Visited filter toggle group */}
 <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-muted/50">
 <Label className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
 <MapPinCheck className="w-3.5 h-3.5" />
 Exploración:
 </Label>
 <ToggleGroup 
 type="single" 
 value={filters.visitedFilter || 'all'}
 onValueChange={(value) => {
 if (value) {
 setFilters({ ...filters, visitedFilter: value as VisitedFilter });
 }
 }}
 className="flex-wrap"
 >
 <ToggleGroupItem value="all" className="text-xs h-7 px-2 data-[state=on]:bg-muted">
 Todos
 </ToggleGroupItem>
 <ToggleGroupItem value="visited" className="text-xs h-7 px-2 data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-700">
 Visitados
 </ToggleGroupItem>
 <ToggleGroupItem value="pending" className="text-xs h-7 px-2 data-[state=on]:bg-slate-100 data-[state=on]:text-slate-700">
 Pendientes
 </ToggleGroupItem>
 </ToggleGroup>
 </div>
 </div>


 {/* Tabbed filters */}
 <Tabs defaultValue="geography" className="w-full">
 <TabsList className="grid w-full grid-cols-4 h-9">
 <TabsTrigger value="geography" className="text-xs gap-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">
 <MapPin className="w-3 h-3" />
 Geo
 {activeFilters.geographic && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
 </TabsTrigger>
 <TabsTrigger value="classification" className="text-xs gap-1 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700">
 <Layers className="w-3 h-3" />
 Tipo
 {activeFilters.classification && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
 </TabsTrigger>
 <TabsTrigger value="tags" className="text-xs gap-1 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700">
 <Tag className="w-3 h-3" />
 Tags
 {filters.tag && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
 </TabsTrigger>
 <TabsTrigger value="types" className="text-xs gap-1 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
 <Building2 className="w-3 h-3" />
 Legacy
 {filters.placeType && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
 </TabsTrigger>
 </TabsList>
 
 <TabsContent value="geography" className="mt-2">
 <GeographyTree />
 </TabsContent>
 
 <TabsContent value="classification" className="mt-2">
 <ClassificationTree />
 </TabsContent>
 
 <TabsContent value="tags" className="mt-2">
 <TagsTree />
 </TabsContent>
 
 <TabsContent value="types" className="mt-2">
 <PlaceTypeFilter />
 </TabsContent>
 </Tabs>
 
 {/* Selection controls */}
 <div className="flex items-center justify-between text-sm pt-2 border-t">
 <div className="flex items-center gap-2">
 <span className="text-muted-foreground">
 <span className="font-medium text-foreground">{selectedCount}</span> seleccionados
 </span>
 </div>
 <div className="flex gap-1">
 <Button
 variant="ghost"
 size="sm"
 onClick={selectAllLocations}
 className="text-xs h-7"
 >
 Seleccionar todo
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={clearSelection}
 className="text-xs h-7"
 disabled={selectedCount === 0}
 >
 Limpiar
 </Button>
 </div>
 </div>

 {/* Quick select by filter */}
 {activeFilters.hasAny && filteredCount > 0 && (
 <div className="flex items-center gap-2">
 <Button
 variant="secondary"
 size="sm"
 onClick={() => selectByFilter(filters)}
 className="flex-1 text-xs"
 >
 Seleccionar {filteredCount} puntos filtrados
 </Button>
 {filteredCount < stats.total && (
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 variant="outline"
 size="icon"
 disabled={isDeleting}
 className="h-8 w-8 shrink-0 border-red-300 text-red-600 hover:bg-red-50"
 title={`Eliminar ${filteredCount} ubicaciones`}
 >
 {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>¿Eliminar {filteredCount} ubicaciones?</AlertDialogTitle>
 <AlertDialogDescription>
 Se moverán a la papelera. Podrás restaurarlas en los próximos 30 días.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleBulkDelete}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 Eliminar
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 )}
 </div>
 )}
 </div>
 );
}