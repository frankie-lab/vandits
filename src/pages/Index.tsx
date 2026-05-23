import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { List, User, Compass, Shield, MapPin, Tag, Layers, SlidersHorizontal } from 'lucide-react';
import { PreferencesPage } from '@/shared/preferences/components/PreferencesPage';
import { ExportPanel } from '@/domains/content/components';
import { BatchEnrichmentPanel } from '@/domains/content/components';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { NotesEditor } from '@/components/NotesEditor';
import { LocationPhotoMenu } from '@/components/LocationPhotoMenu';
import { RoutesListPanel } from '@/components/RoutesListPanel';
import { CollectionsListPanel } from '@/components/CollectionsListPanel';
import { CollectionFocusView } from '@/components/CollectionFocusView';
import { OrphanFocusView } from '@/components/OrphanFocusView';
import {
  initSessionCollectionVisibility,
  resetSessionCollectionVisibility,
} from '@/domains/content/lib/collection-visibility';
import { registerVisibilityDebug } from '@/domains/content/lib/visibility-debug';
import { PersonalCategoriesPanel } from '@/components/PersonalCategoriesPanel';
import { ImportedContentPanel, type ImportedContentTab } from '@/components/ImportedContentPanel';
import { PanelTabs } from '@/shared/components/ui/panel';
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { Route as RouteType, useRoutes } from '@/domains/routes';
import { useLocationsStore } from '@/domains/content';
import { useDatabaseSync } from '@/domains/content';
import { useRealtimeLocations, useLinkedLocationIds } from '@/domains/content';
import { useAuth } from '@/domains/identity';
import { usePermissions } from '@/domains/identity';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AnimatePresence } from 'framer-motion';

// Domain hooks
import { usePopupActions } from '@/domains/content/hooks/use-popup-actions';
import { useDocumentFocus } from '@/domains/content/hooks/use-document-focus';
import { useRouteOrchestration } from '@/domains/routes/hooks/use-route-orchestration';
import { useRouteFocusBus } from '@/domains/routes/hooks/use-route-focus-bus';
import { useRightPanel } from '@/hooks/use-right-panel';
import { useWelcomeCardEvents } from '@/hooks/use-welcome-card-events';
import { usePendingValidationEvents } from '@/hooks/use-pending-validation-events';
import { useIndexGlobalEvents } from '@/hooks/use-index-global-events';
import { useRoutePanelBridge } from '@/hooks/use-route-panel-bridge';

// Discovery orchestrator
import { DiscoveryOrchestrator, type DiscoveryControls } from '@/domains/discovery/components/DiscoveryOrchestrator';

// Lazy-loaded heavy components
const AdminPanel = lazy(() => import('@/components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const UserProfileEditor = lazy(() => import('@/components/UserProfileEditor').then(m => ({ default: m.UserProfileEditor })));
const TrashPanel = lazy(() => import('@/components/TrashPanel').then(m => ({ default: m.TrashPanel })));
const EnrichmentCriteriaConfig = lazy(() => import('@/domains/content/components/EnrichmentCriteriaConfig').then(m => ({ default: m.EnrichmentCriteriaConfig })));
const RouteBuilder = lazy(() => import('@/components/RouteBuilder').then(m => ({ default: m.RouteBuilder })));
const RouteSettingsPanel = lazy(() => import('@/components/RouteSettingsPanel').then(m => ({ default: m.RouteSettingsPanel })));
const UsersSidebar = lazy(() => import('@/components/UsersSidebar').then(m => ({ default: m.UsersSidebar })));

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();

  // ─── Right panel registry (mutual exclusion) ─────────────────────────────
  const { isOpen, open, close, toggle, payload } = useRightPanel();

  // Helpers to read tab payloads safely
  const importedContentTab = (payload?.tab as ImportedContentTab | undefined) ?? 'documents';
  const profileEditorTab = payload?.tab as string | undefined;
  const adminPanelTab = payload?.tab as string | undefined;

  // ─── Modal-dialog states (NOT in right-panel registry) ───────────────────
  const [showExport, setShowExport] = useState(false);
  // PR-EXPORT-2 Fase 3A — payload opcional propagado por `lovable:open-export-panel`.
  const [exportPanelSource, setExportPanelSource] = useState<
    import('@/domains/content/components/ExportPanel').ExportPanelSource | null
  >(null);
  const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
  const [showCriteriaConfig, setShowCriteriaConfig] = useState(false);

  // ─── Content-specific states ──────────────────────────────────────────────
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  const [notesLocation, setNotesLocation] = useState<GeoLocation | null>(null);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  // pendingValidations: estado + listener extraídos a `usePendingValidationEvents`
  // (deuda técnica ítem 5, segunda extracción incremental).
  const { pendingValidationsCount, pendingValidationNames } = usePendingValidationEvents();
  const [photoUploadLocation, setPhotoUploadLocation] = useState<{ id: string; name: string; coordinates: { lat: number; lng: number } } | null>(null);

  // ─── Itineraries / Collections panel sub-tabs ───────────────────────────
  const [routesPanelTab, setRoutesPanelTab] = useState<'routes' | 'collections'>('routes');
  const [focusedCollection, setFocusedCollection] = useState<Collection | null>(null);
  const [orphanFocus, setOrphanFocus] = useState(false);

  // Collection visibility: el panel se suscribe directamente al helper
  // (ADR 004). Index solo dispara init/reset por usuario.
  useEffect(() => {
    if (!user?.id) {
      resetSessionCollectionVisibility();
      return;
    }
    void initSessionCollectionVisibility(user.id);
    registerVisibilityDebug();
  }, [user?.id]);

  // ─── Discovery controls ref ──────────────────────────────────────────────
  const discoveryControlsRef = useRef<DiscoveryControls | null>(null);
  const handleDiscoveryControlsReady = useCallback((controls: DiscoveryControls) => {
    discoveryControlsRef.current = controls;
  }, []);

  const { routes: allRoutes } = useRoutes();

  // ─── Data sync ────────────────────────────────────────────────────────────
  const { loadFromDatabase } = useDatabaseSync(user?.id);
  useRealtimeLocations();
  useLinkedLocationIds();

  // ─── Welcome-card CTAs (emitted by LocationMap empty-state) ──────────────
  // Extraído a `useWelcomeCardEvents` (deuda técnica ítem 5, primera extracción
  // incremental). Mantiene contratos de eventos globales sin cambios.
  useWelcomeCardEvents();

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const routeOrch = useRouteOrchestration(allRoutes);

  // Route panels (routes list & builder) live in the right-panel registry.
  // Puente extraído a `useRoutePanelBridge` (deuda técnica ítem 5, tercera
  // extracción incremental). Contratos sin cambios.
  const routesPanelOpen = isOpen('routes');
  const routeBuilderOpen = isOpen('routeBuilder');
  useRoutePanelBridge({
    routesPanelOpen,
    routeBuilderOpen,
    routeOrch,
    open,
    close,
  });

  const { handlePopupAction } = usePopupActions({
    loadFromDatabase,
    onOpenNotes: (location) => {
      setNotesLocation(location);
      setShowNotesEditor(true);
    },
    onOpenPhotoUpload: (loc) => setPhotoUploadLocation(loc),
  });

  // ─── Auth redirect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // ─── Event listeners ──────────────────────────────────────────────────────
  // Listeners globales extraídos a `useIndexGlobalEvents` (deuda técnica
  // ítem 5, tercera extracción incremental). Contratos de eventos y payloads
  // sin cambios. `pending-validations-updated` vive en `usePendingValidationEvents`.
  useIndexGlobalEvents({
    setCriteriaVersion,
    open,
    loadFromDatabase,
    handlePopupAction,
  });

  // Document focus + route focus delegated to dedicated hooks
  useDocumentFocus({
    allRoutes,
    setVisibleRouteIds: routeOrch.setVisibleRouteIds,
  });
  useRouteFocusBus({
    allRoutes,
    setVisibleRouteIds: routeOrch.setVisibleRouteIds,
  });

  // ─── Loading / Auth guards ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col">
        <div className="h-14 border-b border-border flex items-center px-4 gap-3">
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          <div className="w-24 h-5 rounded bg-muted animate-pulse" />
          <div className="flex-1" />
          <div className="flex gap-2">
            <div className="w-16 h-5 rounded bg-muted animate-pulse" />
            <div className="w-16 h-5 rounded bg-muted animate-pulse" />
            <div className="w-16 h-5 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex-1" />
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          <div className="w-40 h-8 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="flex-1 relative overflow-hidden bg-muted/30">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Cargando mapa...</p>
            </div>
          </div>
          <div className="absolute inset-0 opacity-10">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="absolute w-2 h-2 rounded-full bg-muted-foreground animate-pulse"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
        <div className="h-8 border-t border-border flex items-center px-4 gap-4">
          <div className="w-12 h-3 rounded bg-muted animate-pulse" />
          <div className="w-12 h-3 rounded bg-muted animate-pulse" />
          <div className="w-12 h-3 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const dc = discoveryControlsRef.current;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <Suspense fallback={null}>
        <UsersSidebar
          isOpen={isOpen('usersSidebar')}
          onClose={() => close('usersSidebar')}
          onOpen={() => open('usersSidebar')}
        />
      </Suspense>

      {/* Discovery domain: map, filters, gallery, search, duplicates, layers */}
      <DiscoveryOrchestrator
        onControlsReady={handleDiscoveryControlsReady}
        criteriaVersion={criteriaVersion}
      />

      <FloatingToolbar
        onToggleFilters={() => dc?.toggleFilters()}
        onToggleLocations={() => dc?.toggleLocations()}
        onToggleExport={() => setShowExport(true)}
        onToggleBatchEnrich={() => setShowBatchEnrichment(true)}
        onToggleCriteriaConfig={() => setShowCriteriaConfig(true)}
        onToggleGallery={() => dc?.toggleGallery()}
        onToggleSemanticSearch={() => dc?.toggleSemanticSearch()}
        onToggleDuplicates={() => dc?.toggleDuplicates()}
        onToggleIncomplete={() => dc?.toggleIncomplete()}
        onUploadClick={() => open('importedContent', { tab: 'upload' })}
        onOpenProfile={(tab) => open('profileEditor', { tab })}
        onOpenRouteSettings={() => routeOrch.setShowRouteSettings(true)}
        onOpenAdmin={(tab) => open('adminPanel', { tab })}
        onOpenUsers={() => open('usersSidebar')}
        onOpenTrash={() => open('trash')}
        
        onOpenPreferences={() => open('preferences')}
        onOpenDocuments={() => open('importedContent', { tab: 'documents' })}
        onOpenOneDrivePhotos={() => open('importedContent', { tab: 'onedrive' })}
        onOpenCategories={() => open('categories')}
        onOpenLayers={() => dc?.toggleLayers()}
        onToggleRoutes={() => toggle('routes')}
        filtersOpen={dc?.filtersOpen ?? false}
        locationsOpen={dc?.locationsOpen ?? false}
        activeFilterCount={dc?.activeFilterCount ?? 0}
        pendingValidationsCount={pendingValidationsCount}
        pendingValidationNames={pendingValidationNames}
        key={criteriaVersion}
      />

      {/* Content panels */}
      <ImportedContentPanel
        isOpen={isOpen('importedContent')}
        onClose={() => close('importedContent')}
        defaultTab={importedContentTab}
        onTabChange={(tab) => open('importedContent', { tab })}
      />

      <FloatingPanel title="Categorías personales" icon={<Tag className="w-4 h-4 text-primary" />} isOpen={isOpen('categories')} onClose={() => close('categories')} position="right">
        <PersonalCategoriesPanel />
      </FloatingPanel>

      <FloatingPanel title="Preferencias" icon={<SlidersHorizontal className="w-4 h-4 text-primary" />} isOpen={isOpen('preferences')} onClose={() => close('preferences')} position="right">
        <PreferencesPage onClose={() => close('preferences')} />
      </FloatingPanel>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Exportar datos</DialogTitle>
          </DialogHeader>
          <ExportPanel />
        </DialogContent>
      </Dialog>

      <BatchEnrichmentPanel open={showBatchEnrichment} onOpenChange={setShowBatchEnrichment} />
      <Suspense fallback={null}>
        <EnrichmentCriteriaConfig open={showCriteriaConfig} onOpenChange={setShowCriteriaConfig} />
      </Suspense>

      <NotesEditor
        locationId={notesLocation?.id || null}
        locationName={notesLocation?.name || ''}
        initialNotes={notesLocation?.customData?.notes || ''}
        open={showNotesEditor}
        onOpenChange={setShowNotesEditor}
        onSaved={() => { window.dispatchEvent(new CustomEvent('store-updated')); }}
      />

      <Suspense fallback={null}>
        <AnimatePresence>
          {routeOrch.showRouteSettings && <RouteSettingsPanel onClose={() => routeOrch.setShowRouteSettings(false)} />}
        </AnimatePresence>
      </Suspense>

      <FloatingPanel
        title={profileEditorTab === 'travel' ? 'Viaje' : profileEditorTab === 'privacy' ? 'Privacidad' : profileEditorTab === 'map' ? 'Mapa' : 'Perfil'}
        icon={profileEditorTab === 'travel' ? <Compass className="w-4 h-4 text-primary" /> : profileEditorTab === 'privacy' ? <Shield className="w-4 h-4 text-primary" /> : profileEditorTab === 'map' ? <MapPin className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-primary" />}
        isOpen={isOpen('profileEditor')}
        onClose={() => close('profileEditor')}
        position="right"
      >
        <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
          <UserProfileEditor onClose={() => close('profileEditor')} defaultTab={profileEditorTab} />
        </Suspense>
      </FloatingPanel>

      <Suspense fallback={null}>
        <AnimatePresence>
          {isOpen('adminPanel') && <AdminPanel onClose={() => close('adminPanel')} defaultTab={adminPanelTab as any} />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {isOpen('trash') && <TrashPanel isOpen={isOpen('trash')} onClose={() => close('trash')} />}
        </AnimatePresence>
      </Suspense>

      {photoUploadLocation && (
        <LocationPhotoMenu
          locationId={photoUploadLocation.id}
          locationName={photoUploadLocation.name}
          locationCoordinates={photoUploadLocation.coordinates}
          hasUserImage={false}
          canSetOfficialImage={hasPermission('moderate_content')}
          onPhotoUpdated={() => setPhotoUploadLocation(null)}
          defaultVisibility="private"
        />
      )}

      <FloatingPanel
        title={routesPanelTab === 'collections' ? 'Colecciones' : 'Itinerarios'}
        icon={<List className="w-4 h-4 text-primary" />}
        isOpen={routesPanelOpen}
        onClose={() => { close('routes'); window.dispatchEvent(new CustomEvent('itinerary-focus', { detail: { locationIds: null } })); }}
        position="right"
      >
        <PanelTabs value={routesPanelTab} onValueChange={(v) => setRoutesPanelTab(v as 'routes' | 'collections')}>
          <div className="shrink-0 px-3 pt-3 pb-2 border-b">
            <PanelTabs.Group>
              <PanelTabs.Trigger value="routes">Itinerarios</PanelTabs.Trigger>
              <PanelTabs.Trigger value="collections">Colecciones</PanelTabs.Trigger>
            </PanelTabs.Group>
          </div>
          <PanelTabs.Content value="routes" className="flex-1 min-h-0 outline-none">
            <RoutesListPanel
              onCreateNew={routeOrch.handleCreateRoute}
              onEditRoute={routeOrch.handleEditRoute}
              visibleRouteIds={routeOrch.visibleRouteIds}
              onToggleVisibility={routeOrch.handleToggleRouteVisibility}
              onFocusRoute={async (route) => {
                const ids = new Set<string>([route.id]);
                for (const r of allRoutes) {
                  if (r.parentRouteId === route.id) ids.add(r.id);
                }
                if (route.parentRouteId) {
                  ids.add(route.parentRouteId);
                  for (const r of allRoutes) {
                    if (r.parentRouteId === route.parentRouteId) ids.add(r.id);
                  }
                }
                routeOrch.setVisibleRouteIds(ids);

                const parentId = route.parentRouteId || route.id;
                const { data: wpData } = await supabase
                  .from('route_waypoints')
                  .select('location_id')
                  .eq('route_id', parentId);
                const locationIds = (wpData || [])
                  .map(w => w.location_id)
                  .filter((id): id is string => !!id);
                window.dispatchEvent(new CustomEvent('itinerary-focus', {
                  detail: { locationIds: locationIds.length > 0 ? locationIds : null },
                }));

                const allCoords: { lat: number; lng: number }[] = [];
                for (const rid of ids) {
                  const r = allRoutes.find(rt => rt.id === rid);
                  if (r?.routeGeometry?.coordinates?.length) {
                    const coords = r.routeGeometry.coordinates as number[][];
                    coords.forEach((c: number[]) => allCoords.push({ lat: c[1], lng: c[0] }));
                  }
                }

                if (allCoords.length > 0) {
                  const lats = allCoords.map(c => c.lat);
                  const lngs = allCoords.map(c => c.lng);
                  window.dispatchEvent(new CustomEvent('map-fit-bounds', {
                    detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },
                  }));
                } else {
                  supabase.from('route_waypoints')
                    .select('latitude, longitude')
                    .in('route_id', [...ids])
                    .then(({ data }) => {
                      if (data && data.length > 0) {
                        const lats = data.map(w => w.latitude);
                        const lngs = data.map(w => w.longitude);
                        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
                          detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },
                        }));
                      }
                    });
                }
              }}
            />
          </PanelTabs.Content>
          <PanelTabs.Content value="collections" className="flex-1 min-h-0 outline-none">
            {focusedCollection ? (
              <CollectionFocusView
                collection={focusedCollection}
                onBack={() => setFocusedCollection(null)}
              />
            ) : orphanFocus ? (
              <OrphanFocusView onBack={() => setOrphanFocus(false)} />
            ) : (
              <CollectionsListPanel
                onFocusCollection={(c) => { setOrphanFocus(false); setFocusedCollection(c); }}
                onFocusOrphans={() => { setFocusedCollection(null); setOrphanFocus(true); }}
              />
            )}
          </PanelTabs.Content>
        </PanelTabs>
      </FloatingPanel>

      <FloatingPanel
        title={routeOrch.editRouteId ? "Editar Itinerario" : "Crear Itinerario"}
        icon={<List className="w-4 h-4 text-primary" />}
        isOpen={routeBuilderOpen}
        onClose={routeOrch.handleCloseRouteBuilder}
        position="right"
      >
        <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">Cargando...</div>}>
          <RouteBuilder
            editRouteId={routeOrch.editRouteId}
            onClose={routeOrch.handleCloseRouteBuilder}
            onRouteCalculated={(segments) => routeOrch.setActiveRouteSegments(segments)}
          />
        </Suspense>
      </FloatingPanel>
    </div>
  );
};

export default Index;
