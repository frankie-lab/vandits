import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { dispatchGlobalEvent } from '@/lib/global-events';
import { Search, X, Sparkles, CheckCircle, MapPin, Tag, Building2, Filter, RefreshCw, AlertTriangle, RotateCcw, Layers, Trash2, Loader2, HeartPulse, CheckSquare, AlertCircle, CircleDashed, Shield } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { AppEmptyState } from '@/shared/components/ui';
import { PanelModeTabs, type PanelMode } from './discovery/PanelModeTabs';
import type { HealthFilter } from '@/types/location';
import { useLocationsStore } from '@/domains/content';
import { useFilteredLocations, useFilteredUniverseIgnoringSelection, useEnrichedStats } from '@/domains/content/hooks/use-filtered-locations';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { getBucketStats } from '@/domains/content/lib/location-bucket';
import { useAuth } from '@/domains/identity';
// matchesLocationFilters import removed — was only used by the deleted hiddenByDraft notice
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

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
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import { CLASSIFICATION_TREE } from './filters/ClassificationTree';
import { loadLocationsFromDatabase } from '@/domains/content';
import { HealthFilterActionCTA } from './discovery/HealthFilterActionCTA';
import { HealthRepairPreviewDialog } from './discovery/HealthRepairPreviewDialog';
import { DebtResolutionPanel } from './discovery/DebtResolutionPanel';
import { useSelectionFitOnStart } from './discovery/use-selection-fit-on-start';
import { useHealthFilterFit } from './discovery/use-health-filter-fit';
import { RootStatusChipRow } from './discovery/RootStatusChipRow';
import { UniverseBaseProvider } from './filters/UniverseBaseContext';
import { DebtSelectionProvider } from './filters/DebtSelectionContext';
import { DebtSelectionStatusBar } from './filters/DebtSelectionStatusBar';
import {
  resolveUniverseBase,
  getUniverseBaseLabel,
  type ActiveModeUniverse,
} from '@/domains/content/lib/resolve-universe-base';
import { getVisibleCatalogUniverse } from '@/domains/content/lib/visible-catalog-universe';
import { EffectiveActionFooter } from './filters/EffectiveActionFooter';
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
  // docs/audits/search-filter-selection-state-cross-mode-postflight.md.
  // BLOQUEANTE (regla A): X y T se calculan SIEMPRE sobre el universeBase
  // del modo activo, NUNCA sobre `filteredUniverse`. Esto garantiza que la
  // selección de otro modo NO se contamine en el header al cambiar de pestaña.
  // La derivación real vive más abajo (necesita `universeBaseLocations`).


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

  // BLOQUEANTE: subtab/CTA/árbol DEBEN derivar del MISMO universeBase.
  // Counts de los chips de subtab (Con deuda / Sin enriquecer) se calculan
  // con `resolveUniverseBase` sobre la misma fuente que alimenta el árbol.
  // Ver docs/audits/search-filter-maintain-tree-universe-counts-unification-postflight.md.
  //
  // PR-COUNTS-1: la fuente canónica para contadores de catálogo (header,
  // subtabs, ownershipRatios, árbol) es `catalogVisibleUniverse` —
  // `myCatalog + followedCatalog` aprobados. Coincide con la base del top
  // bar (`getBucketStats(getAllLocations(), uid).catalogTotal`) y cierra el
  // gap 5095 vs 5100. Ver `docs/contracts/poi-counts-canon.md` §3.A.
  // Importante: NO usar `getVisibleUniverseLocations()` aquí (ese es el
  // universo de mapa, fuente B, e incluye detached/no-aprobados).
  const allLocationsForUniverseSource = useMemo(
    () => getVisibleCatalogUniverse(getAllLocations(), user?.id ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAllLocations, documents, user?.id],
  );

  const curationBuckets = useMemo(() => ({
    conDeuda: resolveUniverseBase('debt', allLocationsForUniverseSource).length,
    sinEnriquecer: resolveUniverseBase('unenriched', allLocationsForUniverseSource).length,
  }), [allLocationsForUniverseSource]);

  // PR-FILTER-ROOTSTATUS-2.2 §C — el desglose A/B/C/D vive ahora en una fila
  // compacta (`RootStatusChipRow`) sobre el árbol, en TODOS los universos
  // (Explorar / Con deuda / Sin enriquecer / + Selección). Los counts se
  // calculan dentro del row a partir del scope que recibe (`universeBase`
  // o `universeBase ∩ selection`). Mantenemos `debtRootStatusCounts` como
  // alias para no romper invariante I2 (A+B+C+D ≡ subtab Con deuda) en
  // tests/diagnóstico, derivado del MISMO universeBase('debt').
  const debtRootStatusCounts = useMemo(() => {
    const counts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    const universe = resolveUniverseBase('debt', allLocationsForUniverseSource);
    for (const loc of universe as any[]) {
      counts[classifyPoiRootStatusForLocation(loc).rootStatus] += 1;
    }
    return counts;
  }, [allLocationsForUniverseSource]);

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

  // SoT del universo activo: misma fuente que `curationBuckets` y que los
  // 4 árboles vía UniverseBaseProvider. Garantiza
  //   subtab = CTA = Σ raíces árbol = universeBase.length.
  const allLocationsForUniverse = allLocationsForUniverseSource;

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
  // PR-INLINE-3: `treeFilteredBase` se expone aparte para que el footer pueda
  // intersectar con la selección LOCAL del panel "Con deuda" (debt selection),
  // que es aislada de `selectedLocations` global.
  const treeFilteredBase = useMemo(
    () =>
      universeBaseLocations.filter((l) =>
        matchesLocationFilters(l as any, filters, { includeHealth: false }),
      ),
    [universeBaseLocations, filters],
  );
  const effectiveActionSet = useMemo(() => {
    if (selectedLocations.size === 0) return treeFilteredBase;
    return treeFilteredBase.filter((l) => selectedLocations.has(l.id));
  }, [treeFilteredBase, selectedLocations]);

  // Universo del contador superior: refleja universeBase activo (plan §5).
  const universeForCounter = useMemo(
    () => filteredUniverse.filter((l: any) => universeBaseIds.has(l.id)),
    [filteredUniverse, universeBaseIds],
  );

  // Ownership ratios (X/T, Xm/Tm, Xs/Ts) — derivados del universeBase activo.
  // Regla A (cross-mode): selection ∩ universeBase. Ids fuera del universo
  // del modo activo NO inflan X, y T = universeBase.length (no filteredUniverse).
  // Ver docs/audits/search-filter-selection-state-cross-mode-postflight.md.
  const ownershipRatios = useMemo(() => {
    const uid = user?.id ?? null;
    const T = universeBaseLocations.length;
    let Tm = 0;
    let Xm = 0;
    let X = 0;
    for (const loc of universeBaseLocations as any[]) {
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
  }, [universeBaseLocations, selectedLocations, user?.id]);

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
  // Mismo predicado que `effectiveActionSet` sin userSelection.
  const handleSelectAllInMode = useCallback(() => {
    const base = universeBaseLocations.filter((l) =>
      matchesLocationFilters(l as any, filters, { includeHealth: false }),
    );
    if (base.length === 0) return;
    clearSelection();
    addLocationsToSelection(base.map((l) => l.id));
  }, [universeBaseLocations, filters, clearSelection, addLocationsToSelection]);


  // scopeLabel del footer: primer chip geográfico activo (label más profundo,
  // p. ej. "France" si hay country, "Europe" si solo continente).
  const scopeLabel = useMemo<string | null>(() => {
    const geoChips = activeChips.filter((c) => c.axis === 'geography');
    if (geoChips.length === 0) return null;
    return geoChips[geoChips.length - 1].label;
  }, [activeChips]);

  const hasUserSelection = selectedLocations.size > 0;

  // Opener registrado por HealthFilterActionCTA — sólo se usa cuando hay un
  // `filters.healthFilter` puntual activo (partial/chain/hardError/review).
  // El modal AGREGADO de "Resolver deuda" (universo debt) NO depende de este
  // ref: lo abre `FilterBar` directamente via `debtModalOpen` + dialog
  // montado abajo. Esto cierra la regresión donde `HealthFilterActionCTA`
  // retornaba `null` por `!healthFilter` y el botón "Resolver deuda" del
  // footer quedaba como noop.
  const openHealthRepairRef = useRef<() => void>(() => {});
  const registerHealthRepairOpen = useCallback((open: () => void) => {
    openHealthRepairRef.current = open;
  }, []);

  // Estado local del modal agregado "Resolver deuda" (universo debt).
  // Fase 1 sub-panel: el modal queda como FALLBACK/CONFIRMACIÓN de D repair,
  // ya no es la vista primaria. La vista primaria es `DebtResolutionPanel`,
  // controlada por `debtPanelOpen`.
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPanelOpen, setDebtPanelOpen] = useState(false);

  // Cerrar subpanel al salir del universo debt (cambio de modo/tab).
  useEffect(() => {
    if (activeModeUniverse !== 'debt' && debtPanelOpen) {
      setDebtPanelOpen(false);
    }
  }, [activeModeUniverse, debtPanelOpen]);

  // Scope agregado para el modal: se construye desde `effectiveActionSet`
  // (universeBase ∩ treeSelection [∩ userSelection]). `mode='selection'` si
  // hay selección manual, `mode='filtered'` en caso contrario.
  const debtScope = useMemo(() => ({
    ids: effectiveActionSet.map((l) => l.id),
    total: effectiveActionSet.length,
    mode: (hasUserSelection ? 'selection' : 'filtered') as 'selection' | 'filtered',
    locations: effectiveActionSet,
  }), [effectiveActionSet, hasUserSelection]);






  return (
  <UniverseBaseProvider mode={activeModeUniverse} allLocations={allLocationsForUniverse}>
  <DebtSelectionProvider>
  <div className="flex flex-col h-full min-h-0">
   <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 pb-2">
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
       <span className="text-sm text-muted-foreground leading-none">seleccionados{universeLabel ? ` (${universeLabel})` : ''}</span>
     </div>
     <div className="text-xs mt-1 leading-tight">
       <span className="font-semibold tabular-nums">
         <span className="text-primary">{COUNT_FORMATTER.format(ownershipRatios.Xm)}</span>
         <span className="text-muted-foreground"> / {COUNT_FORMATTER.format(ownershipRatios.Tm)}</span>
       </span>{' '}
       <span className="text-emerald-600 font-medium">Míos</span>
       {' · '}
       <span className="font-semibold tabular-nums">
         <span className="text-primary">{COUNT_FORMATTER.format(ownershipRatios.Xs)}</span>
         <span className="text-muted-foreground"> / {COUNT_FORMATTER.format(ownershipRatios.Ts)}</span>
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
  <label
  className={cn(
  "flex items-center h-7 px-2 cursor-pointer",
  (!hasUserSelection && effectiveActionSet.length === 0) && "opacity-50 cursor-not-allowed"
  )}
  title={hasUserSelection ? 'Deseleccionar todo' : 'Seleccionar todo el subconjunto activo'}
  >
  <Switch
  checked={hasUserSelection}
  disabled={!hasUserSelection && effectiveActionSet.length === 0}
  onCheckedChange={(checked) => {
  if (checked) handleSelectAllInMode();
  else clearSelection();
  }}
  />
  </label>
  </div>
 </div>

  {/* Aviso de filtros restrictivos eliminado: aparecía/desaparecía según umbral y rompía la altura de la fila. */}

  {/* (Aviso "hidden by draft" eliminado — ver comentario al inicio del componente) */}

 </div>

  {debtPanelOpen ? (
    <DebtResolutionPanel
      scope={debtScope as any}
      currentUserId={user?.id ?? null}
      onBack={() => setDebtPanelOpen(false)}
      onOpenRepairConfirm={() => setDebtModalOpen(true)}
    />
  ) : (
  <>
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
            rootStatus: 'bg-slate-200 text-slate-700 hover:bg-slate-300',
          };
          const IconByAxis: Record<FilterAxis, typeof MapPin> = {
            geography: MapPin,
            placeType: Building2,
            tag: Tag,
            classification: Layers,
            search: Search,
            health: HeartPulse,
            rootStatus: Shield,
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
      {/* PR-FILTER-ROOTSTATUS-2.2 §C — el desglose A/B/C/D ya NO vive aquí
          dentro del subtab debt; ahora se renderiza como `RootStatusChipRow`
          generalizado sobre el árbol (debajo), disponible en Explorar, Con
          deuda, Sin enriquecer y cuando hay selección activa. */}
    </Tabs>
  )}

  {/* === Árbol unificado Geo / Tipo / Tags / Legacy ===
      Plan §3: las tres vistas (Explorar, Con deuda, Sin enriquecer) usan la
      MISMA estructura. UniverseBaseProvider recorta el universo base que ven
      los 4 árboles (vía useScopedLocations). Tab activa persiste entre modos. */}
  <UniverseBaseProvider mode={activeModeUniverse} allLocations={allLocationsForUniverse}>
   <DebtSelectionProvider>
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
            registerOpen={registerHealthRepairOpen}
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

    {/* PR-FILTER-ROOTSTATUS-2.2 §C — fila compacta A/B/C/D sobre el árbol.
        Disponible en TODOS los universos. Scope = universeBase, o
        universeBase ∩ selection si hay selección activa. */}
    <RootStatusChipRow
      scopeLocations={
        selectedLocations.size === 0
          ? (universeBaseLocations as unknown[])
          : (universeBaseLocations as any[]).filter((l) => selectedLocations.has(l.id))
      }
      filters={filters}
      setFilters={setFilters}
      scopeLabel={
        panelMode === 'maintain'
          ? (maintainTab === 'debt' ? 'Con deuda' : 'Sin enriquecer')
          : 'Explorar'
      }
      selectionActive={selectedLocations.size > 0}
      testId={`root-status-chip-row-${panelMode === 'maintain' ? maintainTab : 'explore'}`}
    />

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
    <DebtSelectionStatusBar />
   </DebtSelectionProvider>
  </UniverseBaseProvider>
  </>
  )}




   </div>

   {/* Footer fijo de acciones (effectiveActionSet). Aparece en los 4 modos:
       Explorar, Mantener→Con deuda, Mantener→Sin enriquecer, Seleccionar.
       Oculto mientras DebtResolutionPanel está activo (evita doble CTA). */}
   {!debtPanelOpen && (
   <EffectiveActionFooter
     mode={activeModeUniverse}
     locations={effectiveActionSet as any}
     hasUserSelection={hasUserSelection}
     scopeLabel={scopeLabel}
     onClearSelection={clearSelection}
     onResolveDebt={
       activeModeUniverse === 'debt'
         ? () => setDebtPanelOpen(true)
         : undefined
     }
     onSelectAll={handleSelectAllInMode}
   />
   )}

   {/* Modal agregado "Resolver deuda" — montado SIEMPRE que el universo sea
       `debt`, independientemente de que HealthFilterActionCTA esté montado.
       Cierra la regresión del wiring (ref noop). */}
   {activeModeUniverse === 'debt' && (
     <HealthRepairPreviewDialog
       open={debtModalOpen}
       onOpenChange={setDebtModalOpen}
       filter="debt"
       scope={debtScope as any}
       currentUserId={user?.id ?? null}
     />
   )}

  </div>
  );
}