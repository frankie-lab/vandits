import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { dispatchGlobalEvent } from '@/lib/global-events';
import { Search, X, Sparkles, CheckCircle, MapPin, Tag, Building2, Filter, RefreshCw, AlertTriangle, RotateCcw, Layers, Trash2, Loader2, HeartPulse, CheckSquare, AlertCircle, CircleDashed } from 'lucide-react';
import { getPoiCurationLevel } from '@/domains/content/lib/poi-curation-level';
import { Separator } from '@/components/ui/separator';
import { AppEmptyState } from '@/shared/components/ui';
import { PanelModeTabs, type PanelMode } from './discovery/PanelModeTabs';
import type { HealthFilter } from '@/types/location';
import { useLocationsStore } from '@/domains/content';
import { useFilteredLocations, useFilteredUniverseIgnoringSelection, useEnrichedStats } from '@/domains/content/hooks/use-filtered-locations';
import { getBucketStats } from '@/domains/content/lib/location-bucket';
import { useAuth } from '@/domains/identity';
// matchesLocationFilters import removed — was only used by the deleted hiddenByDraft notice
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { PLACE_TYPE_LABELS } from '@/types/location';
import { GeographyTree } from './filters/GeographyTree';
import { TagsTree } from './filters/TagsTree';
import { PlaceTypeFilter } from './filters/PlaceTypeFilter';
import { ClassificationTree } from './filters/ClassificationTree';
import { SelectionActions } from './filters/SelectionActions';
import {
  resetAllFilters,
  clearGeographyFilters as clearGeographyFiltersHelper,
  getActiveFilterChips,
  type FilterAxis,
} from '@/domains/content/lib/filter-presets';
import { CLASSIFICATION_TREE } from './filters/ClassificationTree';
import { loadLocationsFromDatabase } from '@/domains/content';
import { HealthFilterActionCTA } from './discovery/HealthFilterActionCTA';
import { useSelectionFitOnStart } from './discovery/use-selection-fit-on-start';
import { useHealthFilterFit } from './discovery/use-health-filter-fit';
import { UniverseBaseProvider } from './filters/UniverseBaseContext';
import {
  resolveUniverseBase,
  getUniverseBaseLabel,
  type ActiveModeUniverse,
} from '@/domains/content/lib/resolve-universe-base';
import { toast } from 'sonner';



const COUNT_FORMATTER = new Intl.NumberFormat('es-ES');

export function FilterBar() {
  const {
  filters,
  setFilters,
  selectedLocations,
  selectAllLocations,
  clearSelection,
  addLocationsToSelection,
  selectByFilter,
  selectedDocument,
  updateDocumentLocations,
  } = useLocationsStore();

  const getAllLocations = useLocationsStore(s => s.getAllLocations);
  const documents = useLocationsStore(s => s.documents);
  
  const filteredLocations = useFilteredLocations();
  // Universo visible/autorizado SIN recortar por selección. Es la base canónica

  // de los denominadores T/Tm/Ts del contador y del desglose bucketStats —
  // garantiza que seleccionar no colapse los totales.
  // Ver docs/audits/selection-counter-ownership-ratios-plan.md.
  const filteredUniverse = useFilteredUniverseIgnoringSelection();
  const stats = useEnrichedStats();
  const { user } = useAuth();
  // Desglose Catálogo / Mesa / Seguidos sobre el UNIVERSO (no la selección).
  // Single Source of Truth: location.isApproved decide Catálogo (no doc.status).
  const bucketStats = useMemo(
    () => getBucketStats(filteredUniverse as any, user?.id),
    [filteredUniverse, user?.id],
  );

  // Ownership ratios (X/T, Xm/Tm, Xs/Ts) — ver
  // docs/audits/selection-counter-ownership-ratios-plan.md.
  // Denominadores T/Tm/Ts = `filteredUniverse` (sin recorte por selección).
  // Numeradores X/Xm/Xs = intersección selección ∩ universo (ids fuera del
  // universo no inflan X).
  const ownershipRatios = useMemo(() => {
    const uid = user?.id ?? null;
    const T = filteredUniverse.length;
    let Tm = 0;
    let Xm = 0;
    let X = 0;
    for (const loc of filteredUniverse as any[]) {
      const ownerId = (loc.ownerUserId ?? loc._docUserId ?? null) as string | null;
      const mine = !!uid && ownerId === uid;
      if (mine) Tm += 1;
      if (selectedLocations.has(loc.id)) {
        X += 1;
        if (mine) Xm += 1;
      }
    }
    const Ts = T - Tm;
    const Xs = X - Xm;
    return { T, Tm, Ts, X, Xm, Xs };
  }, [filteredUniverse, selectedLocations, user?.id]);

  // Aviso "hidden by draft" eliminado: tras la nueva regla de visibilidad
  // (mem://logic/map/visibility-rule-rls-only) los documentos en borrador
  // ya NO ocultan sus puntos del mapa global. Status es solo metadato editorial.
  
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

  // Desglose por niveles de curación canónicos (POI-0/1/3/5/9/10) → 3 grupos accionables
  const curationBuckets = useMemo(() => {
    let completos = 0;   // POI-9 + POI-10 → enriched + geo OK
    let conDeuda = 0;    // POI-5 → enriched con deuda objetiva (rings/geo parcial)
    let sinEnriquecer = 0; // POI-0 + POI-1 → importado sin IA o vacío
    for (const loc of filteredLocations) {
      const { level } = getPoiCurationLevel(loc as any);
      if (level === 9 || level === 10) completos++;
      else if (level === 5) conDeuda++;
      else if (level === 0 || level === 1) sinEnriquecer++;
      else if (level === 3) conDeuda++; // POI-3 (raro) lo agrupamos con deuda
    }
    return { completos, conDeuda, sinEnriquecer };
  }, [filteredLocations]);

  // PR-4A.1 — Auto-fit del mapa cuando arranca una selección masiva (0 → N).
  // Internamente debounced 250ms y con guard "solo el primer fit".
  useSelectionFitOnStart(selectedLocations);

  // PR-A — Auto-fit al activar / cambiar un chip del eje "Salud".
  // Universo lógico = filteredLocations (NUNCA markerLocations / viewport).
  // Geo / Tipo / Tags / búsqueda no disparan fit.
  useHealthFilterFit(filters.healthFilter ?? null, filteredLocations as any);

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
 dispatchGlobalEvent('trash-updated');
 window.dispatchEvent(new CustomEvent('store-updated'));
 } catch (error) {
 console.error('Bulk delete error:', error);
 toast.error('Error al eliminar ubicaciones', { id: toastId });
 } finally {
 setIsDeleting(false);
 }
 }, [filteredLocations, setFilters]);

  // Chips de filtros activos — fuente única en filter-presets.ts.
  // Cualquier eje (Geo / Tipo / Tags / Legacy / Búsqueda) se renderiza desde aquí.
  const activeChips = useMemo(
    () =>
      getActiveFilterChips(filters, {
        placeTypeLabel: (code) => PLACE_TYPE_LABELS[code as keyof typeof PLACE_TYPE_LABELS] ?? code,
        classificationLabel: (code) =>
          (CLASSIFICATION_TREE as Record<string, string>)[code] ?? code,
      }),
    [filters]
  );
  const hasActiveChips = activeChips.length > 0;

  // === Norma "filter axes" — TODA limpieza pasa por filter-presets.ts ===
  const clearAllFilters = () => {
    setFilters(resetAllFilters(filters));
  };

  const clearGeographyFilters = () => {
    setFilters(clearGeographyFiltersHelper(filters));
  };

  // Check if filters are significantly reducing results
 const filterReductionWarning = stats.total > 0 && filteredCount < stats.total * 0.2 && filteredCount < 50;

  // === PR-4A: Panel modes (Explorar / Mantener / Seleccionar) ===
  // Persistencia ligera en sessionStorage; modo inicial inferido por contexto.
  const STORAGE_KEY = 'vandits.panelMode';
  const inferInitialMode = (): PanelMode => {
    if (typeof window === 'undefined') return 'explore';
    if (filters.healthFilter) return 'maintain';
    const stored = window.sessionStorage.getItem(STORAGE_KEY) as PanelMode | null;
    if (stored === 'explore' || stored === 'maintain') return stored;
    return 'explore';
  };
  const [panelMode, setPanelMode] = useState<PanelMode>(inferInitialMode);

  const [maintainTab, setMaintainTab] = useState<'debt' | 'unenriched'>('debt');

  // Tab activa del árbol (Geo / Tipo / Tags / Legacy). Se PRESERVA al
  // alternar Explorar ↔ Mantener (ver plan §3: persistencia de tab).
  type TreeTab = 'geography' | 'classification' | 'tags' | 'types';
  const [treeTab, setTreeTab] = useState<TreeTab>('geography');

  // Universo activo (SoT del plan §1). Mantener→Con deuda = 'debt';
  // Mantener→Sin enriquecer = 'unenriched'; resto = 'all'.
  const activeModeUniverse: ActiveModeUniverse =
    panelMode === 'maintain'
      ? (maintainTab === 'debt' ? 'debt' : 'unenriched')
      : 'all';

  const allLocationsForUniverse = useMemo(
    () => getAllLocations(),
    // Reactivo a cambios reales del store (documentos / locations).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAllLocations, documents],
  );

  // Universo base resuelto + set de ids para intersecciones O(1).
  const universeBaseLocations = useMemo(
    () => resolveUniverseBase(activeModeUniverse, allLocationsForUniverse),
    [activeModeUniverse, allLocationsForUniverse],
  );
  const universeBaseIds = useMemo(
    () => new Set(universeBaseLocations.map((l) => l.id)),
    [universeBaseLocations],
  );

  // effectiveActionSet (plan §1, ajuste obligatorio):
  //   userSelection no vacía → universeBase ∩ treeSelection ∩ userSelection
  //   userSelection vacía    → universeBase ∩ treeSelection
  // `filteredLocations` ya aplica treeSelection (geo/tipo/tags/búsqueda). Lo
  // intersectamos con universeBase. Para userSelection, sumamos el recorte
  // sólo cuando existe.
  const effectiveActionSet = useMemo(() => {
    const base = filteredLocations.filter((l) => universeBaseIds.has(l.id));
    if (selectedLocations.size === 0) return base;
    return base.filter((l) => selectedLocations.has(l.id));
  }, [filteredLocations, universeBaseIds, selectedLocations]);

  // Universo del contador superior: refleja universeBase activo (plan §5).
  const universeForCounter = useMemo(
    () => filteredUniverse.filter((l: any) => universeBaseIds.has(l.id)),
    [filteredUniverse, universeBaseIds],
  );

  const universeLabel = getUniverseBaseLabel(activeModeUniverse);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, panelMode);
    }
  }, [panelMode]);
  // Auto-switch sólo cuando el contexto fuerza la intención (no sobreescribe elección manual repetida).
  useEffect(() => {
    if (filters.healthFilter && panelMode !== 'maintain') {
      setPanelMode('maintain');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.healthFilter]);

  // "Seleccionar todo" del modo activo: selecciona universeBase ∩ treeSelection.
  // No intersecta con userSelection (es justo lo que la materializa).
  const handleSelectAllInMode = useCallback(() => {
    const base = filteredLocations.filter((l) => universeBaseIds.has(l.id));
    if (base.length === 0) return;
    clearSelection();
    addLocationsToSelection(base.map((l) => l.id));
  }, [filteredLocations, universeBaseIds, clearSelection, addLocationsToSelection]);






  return (
  <div className="flex flex-col h-full min-h-0">
   <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
    {/* Stats bar with prominent filter summary */}
    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg p-3 space-y-2">
  {/* Result count - formato unificado X / Y etiqueta en ambos estados */}
   <div className="flex items-center justify-between">
   <div className="flex flex-col">
     <div className="flex items-center gap-2">
       <span className="text-lg font-semibold leading-none tabular-nums">
         <span className="text-primary">{COUNT_FORMATTER.format(ownershipRatios.X)}</span>
         <span className="text-muted-foreground"> / {COUNT_FORMATTER.format(ownershipRatios.T)}</span>
       </span>
       <span className="text-sm text-muted-foreground leading-none">seleccionados</span>
     </div>
     <div className="text-xs mt-1 leading-tight">
       <span className="font-semibold tabular-nums">
         <span className="text-primary">{COUNT_FORMATTER.format(ownershipRatios.Xm)}</span>
         <span className="text-muted-foreground"> / {COUNT_FORMATTER.format(ownershipRatios.T)}</span>
       </span>{' '}
       <span className="text-emerald-600 font-medium">Míos</span>
       {' · '}
       <span className="font-semibold tabular-nums">
         <span className="text-primary">{COUNT_FORMATTER.format(ownershipRatios.Xs)}</span>
         <span className="text-muted-foreground"> / {COUNT_FORMATTER.format(stats.total)}</span>
       </span>{' '}
       <span className="text-sky-600 font-medium">Seguidos</span>
     </div>
   </div>
  <div className="flex items-center gap-1">
  {hasActiveChips && (
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

  {/* Warning when filters are very restrictive — secundario, no compite con la selección */}
  {filterReductionWarning && (
  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1">
  <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500/70" />
  <span>Filtros activos: mostrando {Math.round(filteredCount/stats.total*100)}% del total</span>
  </div>
  )}

  {/* (Aviso "hidden by draft" eliminado — ver comentario al inicio del componente) */}

 </div>

  {/* Active filters summary - chips data-driven (todos los ejes) */}
  {hasActiveChips && (
    <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Filter className="w-3 h-3" />
        Filtros activos:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeChips.map((chip) => {
          const styleByAxis: Record<FilterAxis, string> = {
            geography: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
            placeType: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
            tag: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
            classification: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
            search: 'bg-muted text-muted-foreground hover:bg-muted/80',
            health: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
          };
          const IconByAxis: Record<FilterAxis, typeof MapPin> = {
            geography: MapPin,
            placeType: Building2,
            tag: Tag,
            classification: Layers,
            search: Search,
            health: HeartPulse,
          };
          const Icon = IconByAxis[chip.axis];
          return (
            <Badge
              key={chip.id}
              variant="secondary"
              className={cn('gap-1 pr-1 text-xs cursor-pointer', styleByAxis[chip.axis])}
              onClick={() => setFilters(chip.remove(filters))}
            >
              <Icon className="w-3 h-3" />
              {chip.label}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          );
        })}
      </div>
    </div>
  )}

      {/* Bloque "Visita / Estado" eliminado por norma transversal:
          el universo de puntos se muestra completo y los únicos ejes de
          filtrado son clasificación (Geo / Tipo / Tags / Legacy) y búsqueda. */}

  {/* === PR-4A: Panel modes === */}
  <PanelModeTabs
    value={panelMode}
    onChange={setPanelMode}
    exploreActive={hasActiveChips}
    maintainActive={!!filters.healthFilter}
  />


  {/* === Sub-tabs de Mantener (solo cuando panelMode='maintain') ===
      Selecciona el universo base (debt vs unenriched). El árbol Geo/Tipo/Tags/
      Legacy se renderiza igual debajo, scope cambia vía UniverseBaseProvider. */}
  {panelMode === 'maintain' && (
    <Tabs value={maintainTab} onValueChange={(v) => setMaintainTab(v as 'debt' | 'unenriched')} className="w-full">
      <TabsList className="grid grid-cols-2 w-full h-8 p-1">
        <TabsTrigger value="debt" className="text-xs gap-1.5">
          <AlertCircle className="w-3 h-3 text-amber-600" />
          Con deuda
          <span className="tabular-nums text-muted-foreground">{COUNT_FORMATTER.format(curationBuckets.conDeuda)}</span>
        </TabsTrigger>
        <TabsTrigger value="unenriched" className="text-xs gap-1.5">
          <CircleDashed className="w-3 h-3" />
          Sin enriquecer
          <span className="tabular-nums text-muted-foreground">{COUNT_FORMATTER.format(curationBuckets.sinEnriquecer)}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )}

  {/* === Árbol unificado Geo / Tipo / Tags / Legacy ===
      Plan §3: las tres vistas (Explorar, Con deuda, Sin enriquecer) usan la
      MISMA estructura. UniverseBaseProvider recorta el universo base que ven
      los 4 árboles (vía useScopedLocations). Tab activa persiste entre modos. */}
  <UniverseBaseProvider mode={activeModeUniverse} allLocations={allLocationsForUniverse}>
    {panelMode === 'maintain' && (
      <div className="space-y-1.5 mt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Acción sobre {universeLabel ?? 'subconjunto'}
            <span className="ml-1 normal-case tabular-nums text-muted-foreground/70">
              ({COUNT_FORMATTER.format(effectiveActionSet.length)})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllInMode}
            disabled={effectiveActionSet.length === 0 && selectedLocations.size === 0}
            className="h-6 px-2 text-[11px] gap-1"
          >
            <CheckSquare className="w-3 h-3" />
            Seleccionar todo
          </Button>
        </div>
        {maintainTab === 'debt' ? (
          <HealthFilterActionCTA
            healthFilter={filters.healthFilter ?? null}
            filteredLocations={effectiveActionSet as any}
            selectedLocationIds={selectedLocations}
          />
        ) : (
          <div className="text-xs text-muted-foreground px-1 py-2">
            {effectiveActionSet.length > 0
              ? `${COUNT_FORMATTER.format(effectiveActionSet.length)} POIs sin enriquecer en el subconjunto activo. La cola de enriquecimiento masivo se gestiona desde el panel de Imported Content.`
              : 'No hay POIs sin enriquecer en el subconjunto actual.'}
          </div>
        )}
      </div>
    )}

    <Tabs value={treeTab} onValueChange={(v) => setTreeTab(v as TreeTab)} className="w-full mt-2">
      <TabsList className="grid w-full grid-cols-4 h-9">
        {(() => {
          const hasAxis = (axis: FilterAxis) => activeChips.some((c) => c.axis === axis);
          return (
            <>
              <TabsTrigger value="geography" className="text-xs gap-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">
                <MapPin className="w-3 h-3" />
                Geo
                {hasAxis('geography') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </TabsTrigger>
              <TabsTrigger value="classification" className="text-xs gap-1 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700">
                <Layers className="w-3 h-3" />
                Tipo
                {hasAxis('classification') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </TabsTrigger>
              <TabsTrigger value="tags" className="text-xs gap-1 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700">
                <Tag className="w-3 h-3" />
                Tags
                {hasAxis('tag') && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
              </TabsTrigger>
              <TabsTrigger value="types" className="text-xs gap-1 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                <Building2 className="w-3 h-3" />
                Legacy
                {hasAxis('placeType') && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
              </TabsTrigger>
            </>
          );
        })()}
      </TabsList>

      <TabsContent value="geography" className="mt-2 min-w-0 overflow-hidden">
        <GeographyTree />
      </TabsContent>
      <TabsContent value="classification" className="mt-2 min-w-0 overflow-hidden">
        <ClassificationTree />
      </TabsContent>
      <TabsContent value="tags" className="mt-2 min-w-0 overflow-hidden">
        <TagsTree />
      </TabsContent>
      <TabsContent value="types" className="mt-2 min-w-0 overflow-hidden">
        <PlaceTypeFilter />
      </TabsContent>
    </Tabs>
  </UniverseBaseProvider>




   </div>
  </div>
  );
}