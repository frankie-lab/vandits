import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, List, Volume2, User, Compass, Shield, MapPin, Users, FolderOpen, Tag } from 'lucide-react';
import { SoundSettingsPanel } from '@/components/SoundSettingsPanel';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { GeocodeButton } from '@/components/GeocodeButton';
import { BatchEnrichmentPanel } from '@/components/BatchEnrichmentPanel';
import { BottomProgressBar } from '@/components/BottomProgressBar';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { GalleryView } from '@/components/GalleryView';
import { SemanticSearch } from '@/components/SemanticSearch';
import { DuplicatesList } from '@/components/DuplicatesList';
import { NotesEditor } from '@/components/NotesEditor';
import { LocationPhotoMenu } from '@/components/LocationPhotoMenu';
import { IncompleteLocationsPanel } from '@/components/IncompleteLocationsPanel';
import { UnresolvedLocationsPanel } from '@/components/UnresolvedLocationsPanel';
import { RoutesListPanel } from '@/components/RoutesListPanel';
import { DocumentsPanel } from '@/components/DocumentsPanel';
import { PersonalCategoriesPanel } from '@/components/PersonalCategoriesPanel';
import { Route as RouteType, useRoutes } from '@/hooks/use-routes';
import { useLocationsStore } from '@/store/locations-store';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { useRealtimeLocations } from '@/hooks/use-realtime-locations';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
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
import { useCuratorDruidMode } from '@/domains/content/hooks/use-curator-druid-mode';
import { useRouteOrchestration } from '@/domains/routes/hooks/use-route-orchestration';

// Lazy-loaded heavy components (only loaded when user opens them)
const AdminPanel = lazy(() => import('@/components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const UserProfileEditor = lazy(() => import('@/components/UserProfileEditor').then(m => ({ default: m.UserProfileEditor })));
const TrashPanel = lazy(() => import('@/components/TrashPanel').then(m => ({ default: m.TrashPanel })));
const CuratorEnrichmentSettings = lazy(() => import('@/components/CuratorEnrichmentSettings').then(m => ({ default: m.CuratorEnrichmentSettings })));
const EnrichmentCriteriaConfig = lazy(() => import('@/components/EnrichmentCriteriaConfig').then(m => ({ default: m.EnrichmentCriteriaConfig })));
const RouteBuilder = lazy(() => import('@/components/RouteBuilder').then(m => ({ default: m.RouteBuilder })));
const RouteSettingsPanel = lazy(() => import('@/components/RouteSettingsPanel').then(m => ({ default: m.RouteSettingsPanel })));
const UsersSidebar = lazy(() => import('@/components/UsersSidebar').then(m => ({ default: m.UsersSidebar })));

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isMaster } = usePermissions();

  // ─── Panel visibility states ──────────────────────────────────────────────
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showLocationsPanel, setShowLocationsPanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showCriteriaConfig, setShowCriteriaConfig] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileEditorTab, setProfileEditorTab] = useState<string | undefined>(undefined);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPanelTab, setAdminPanelTab] = useState<string | undefined>(undefined);
  const [showUsersSidebar, setShowUsersSidebar] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showCuratorEnrichmentSettings, setShowCuratorEnrichmentSettings] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  // ─── Content-specific states ──────────────────────────────────────────────
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  const [notesLocation, setNotesLocation] = useState<GeoLocation | null>(null);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [pendingValidationsCount, setPendingValidationsCount] = useState(0);
  const [pendingValidationNames, setPendingValidationNames] = useState<string[]>([]);
  const [photoUploadLocation, setPhotoUploadLocation] = useState<{ id: string; name: string; coordinates: { lat: number; lng: number } } | null>(null);

  const { filters } = useLocationsStore();
  const { routes: allRoutes } = useRoutes();

  // ─── Data sync ────────────────────────────────────────────────────────────
  const { loadFromDatabase } = useDatabaseSync(user?.id);
  useRealtimeLocations();

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const routeOrch = useRouteOrchestration(allRoutes);

  useCuratorDruidMode(loadFromDatabase);
  useLayerVisibility();

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
  useEffect(() => {
    const handleCriteriaChange = () => setCriteriaVersion(v => v + 1);
    window.addEventListener('enrichment-criteria-changed', handleCriteriaChange);
    return () => window.removeEventListener('enrichment-criteria-changed', handleCriteriaChange);
  }, []);

  useEffect(() => {
    const handleFollowChanged = async () => {
      console.log('[Index] Follow changed, refreshing map data...');
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadFromDatabase();
    };
    window.addEventListener('lovable:follow-changed', handleFollowChanged);
    return () => window.removeEventListener('lovable:follow-changed', handleFollowChanged);
  }, [loadFromDatabase]);

  useEffect(() => {
    const handleValidationsUpdate = (e: CustomEvent<{ count: number; names: string[] }>) => {
      setPendingValidationsCount(e.detail.count);
      setPendingValidationNames(e.detail.names || []);
    };
    window.addEventListener('pending-validations-updated', handleValidationsUpdate as EventListener);
    return () => window.removeEventListener('pending-validations-updated', handleValidationsUpdate as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => handlePopupAction(e as CustomEvent);
    window.addEventListener('popup-action', handler);
    return () => window.removeEventListener('popup-action', handler);
  }, [handlePopupAction]);

  // Listen for document view events from DocumentsPanel
  useEffect(() => {
    const handleDocumentView = (e: CustomEvent) => {
      const detail = e.detail;
      if (!detail) {
        // Clear document view — restore normal map
        useLocationsStore.getState().setFilters({
          filterByDocumentId: undefined,
          filterByDocumentName: undefined,
        });
        routeOrch.setVisibleRouteIds(new Set());
        return;
      }

      const { docId, docName, routeIds } = detail;
      // Filter locations to only this document
      useLocationsStore.getState().setFilters({
        filterByDocumentId: docId,
        filterByDocumentName: docName,
      });
      // Show only this document's routes
      routeOrch.setVisibleRouteIds(new Set(routeIds || []));
    };

    window.addEventListener('document:view-on-map', handleDocumentView as EventListener);
    return () => window.removeEventListener('document:view-on-map', handleDocumentView as EventListener);
  }, [routeOrch.setVisibleRouteIds]);

  // Listen for route highlight from DocumentContentManager
  useEffect(() => {
    const handleRouteToggle = (e: CustomEvent<{ routeId: string }>) => {
      const { routeId } = e.detail;
      routeOrch.setVisibleRouteIds(prev => {
        const next = new Set(prev);
        if (next.has(routeId)) next.delete(routeId); else next.add(routeId);
        return next;
      });

      // Fit map to route bounds
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.routeGeometry?.coordinates?.length) {
        const coords = route.routeGeometry.coordinates as number[][];
        const lats = coords.map((c: number[]) => c[1]);
        const lngs = coords.map((c: number[]) => c[0]);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: {
            bounds: [
              [Math.min(...lats), Math.min(...lngs)],
              [Math.max(...lats), Math.max(...lngs)],
            ],
            padding: [60, 60],
            maxZoom: 14,
          },
        }));
      }
    };

    window.addEventListener('route:toggle-visibility', handleRouteToggle as EventListener);
    return () => window.removeEventListener('route:toggle-visibility', handleRouteToggle as EventListener);
  }, [allRoutes, routeOrch.setVisibleRouteIds]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const handleLocationFocus = (location: GeoLocation) => {
    useLocationsStore.getState().setFocusedLocation(location.id);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.continent) count++;
    if (filters.country) count++;
    if (filters.region) count++;
    if (filters.zone) count++;
    if (filters.tag) count++;
    if (filters.placeType) count++;
    if (filters.onlyEnriched) count++;
    if (filters.verified) count++;
    if (filters.searchTerm) count++;
    return count;
  }, [filters]);

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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <Suspense fallback={null}>
        <UsersSidebar
          isOpen={showUsersSidebar}
          onClose={() => setShowUsersSidebar(false)}
          onOpen={() => setShowUsersSidebar(true)}
        />
      </Suspense>

      <div className="absolute inset-0">
        <LocationMap />
      </div>

      <FloatingToolbar
        onToggleFilters={() => setShowFiltersPanel(!showFiltersPanel)}
        onToggleLocations={() => setShowLocationsPanel(!showLocationsPanel)}
        onToggleExport={() => setShowExportPanel(true)}
        onToggleBatchEnrich={() => setShowBatchEnrichment(true)}
        onToggleCriteriaConfig={() => setShowCriteriaConfig(true)}
        onToggleGallery={() => setShowGallery(true)}
        onToggleSemanticSearch={() => setShowSemanticSearch(prev => !prev)}
        onToggleDuplicates={() => setShowDuplicates(true)}
        onToggleIncomplete={() => setShowIncomplete(prev => !prev)}
        onToggleValidations={() => setShowCuratorEnrichmentSettings(true)}
        onUploadClick={() => setShowUploadDialog(true)}
        onOpenProfile={(tab) => { setProfileEditorTab(tab); setShowProfileEditor(true); }}
        onOpenRouteSettings={() => routeOrch.setShowRouteSettings(true)}
        onOpenAdmin={(tab) => { setAdminPanelTab(tab); setShowAdminPanel(true); }}
        onOpenUsers={() => setShowUsersSidebar(true)}
        onOpenTrash={() => setShowTrash(true)}
        onOpenSoundSettings={() => setShowSoundSettings(true)}
        onOpenDocuments={() => setShowDocuments(true)}
        onOpenCategories={() => setShowCategories(true)}
        onToggleRoutes={() => routeOrch.setShowRoutesPanel(prev => !prev)}
        filtersOpen={showFiltersPanel}
        locationsOpen={showLocationsPanel}
        activeFilterCount={activeFilterCount}
        pendingValidationsCount={pendingValidationsCount}
        pendingValidationNames={pendingValidationNames}
        key={criteriaVersion}
      />

      <div className="fixed bottom-16 left-4 z-[999]">
        <GeocodeButton />
      </div>

      <BottomProgressBar />

      <FloatingPanel title="Notificaciones" icon={<Volume2 className="w-4 h-4 text-primary" />} isOpen={showSoundSettings} onClose={() => setShowSoundSettings(false)} position="right">
        <SoundSettingsPanel />
      </FloatingPanel>

      <FloatingPanel title="Documentos importados" icon={<FolderOpen className="w-4 h-4 text-primary" />} isOpen={showDocuments} onClose={() => setShowDocuments(false)} position="right">
        <DocumentsPanel />
      </FloatingPanel>

      <FloatingPanel title="Categorías personales" icon={<Tag className="w-4 h-4 text-primary" />} isOpen={showCategories} onClose={() => setShowCategories(false)} position="right">
        <PersonalCategoriesPanel />
      </FloatingPanel>

      <FloatingPanel title="Filtros" icon={<Filter className="w-4 h-4 text-primary" />} isOpen={showFiltersPanel} onClose={() => setShowFiltersPanel(false)} position="left">
        <div className="p-3"><FilterBar /></div>
      </FloatingPanel>

      <FloatingPanel title="Ubicaciones" icon={<List className="w-4 h-4 text-primary" />} isOpen={showLocationsPanel} onClose={() => setShowLocationsPanel(false)} position="right" topOffset={showSemanticSearch ? 'top-[calc(50vh+0.5rem)]' : undefined}>
        <LocationList />
      </FloatingPanel>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {filters.filterByCuratorId ? `Subir archivo para curador: ${filters.filterByCuratorName}` : 'Subir archivos de destinos'}
            </DialogTitle>
          </DialogHeader>
          <FileUploadZone
            curatorId={filters.filterByCuratorId}
            curatorName={filters.filterByCuratorName}
            onUploadComplete={() => {
              setShowUploadDialog(false);
              if (filters.filterByCuratorId) {
                window.dispatchEvent(new CustomEvent('lovable:filter-by-curator', {
                  detail: { curatorId: filters.filterByCuratorId, curatorName: filters.filterByCuratorName }
                }));
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showExportPanel} onOpenChange={setShowExportPanel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Exportar datos</DialogTitle>
          </DialogHeader>
          <ExportPanel />
        </DialogContent>
      </Dialog>

      <BatchEnrichmentPanel open={showBatchEnrichment} onOpenChange={setShowBatchEnrichment} curatorId={filters.filterByCuratorId} />
      <Suspense fallback={null}>
        <EnrichmentCriteriaConfig open={showCriteriaConfig} onOpenChange={setShowCriteriaConfig} />
      </Suspense>

      <AnimatePresence>
        {showGallery && <GalleryView onClose={() => setShowGallery(false)} onLocationClick={handleLocationFocus} />}
      </AnimatePresence>

      <AnimatePresence>
        {showSemanticSearch && <SemanticSearch onClose={() => setShowSemanticSearch(false)} onLocationClick={handleLocationFocus} splitWithLocations={showLocationsPanel} />}
      </AnimatePresence>

      <AnimatePresence>
        {showDuplicates && <DuplicatesList onClose={() => setShowDuplicates(false)} onLocationClick={handleLocationFocus} />}
      </AnimatePresence>

      <NotesEditor
        locationId={notesLocation?.id || null}
        locationName={notesLocation?.name || ''}
        initialNotes={notesLocation?.customData?.notes || ''}
        open={showNotesEditor}
        onOpenChange={setShowNotesEditor}
        onSaved={() => { window.dispatchEvent(new CustomEvent('store-updated')); }}
      />

      <IncompleteLocationsPanel isOpen={showIncomplete} onClose={() => setShowIncomplete(false)} onLocationClick={() => {}} />
      <UnresolvedLocationsPanel isOpen={showUnresolved} onClose={() => setShowUnresolved(false)} onLocationClick={() => {}} />

      <Suspense fallback={null}>
        <AnimatePresence>
          {routeOrch.showRouteSettings && <RouteSettingsPanel onClose={() => routeOrch.setShowRouteSettings(false)} />}
        </AnimatePresence>
      </Suspense>

      <FloatingPanel
        title={profileEditorTab === 'travel' ? 'Viaje' : profileEditorTab === 'privacy' ? 'Privacidad' : profileEditorTab === 'map' ? 'Mapa' : 'Perfil'}
        icon={profileEditorTab === 'travel' ? <Compass className="w-4 h-4 text-primary" /> : profileEditorTab === 'privacy' ? <Shield className="w-4 h-4 text-primary" /> : profileEditorTab === 'map' ? <MapPin className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-primary" />}
        isOpen={showProfileEditor}
        onClose={() => { setShowProfileEditor(false); setProfileEditorTab(undefined); }}
        position="right"
      >
        <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
          <UserProfileEditor onClose={() => { setShowProfileEditor(false); setProfileEditorTab(undefined); }} defaultTab={profileEditorTab} />
        </Suspense>
      </FloatingPanel>

      <Suspense fallback={null}>
        <AnimatePresence>
          {showAdminPanel && <AdminPanel onClose={() => { setShowAdminPanel(false); setAdminPanelTab(undefined); }} defaultTab={adminPanelTab as any} />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {showTrash && <TrashPanel isOpen={showTrash} onClose={() => setShowTrash(false)} />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        {filters.filterByCuratorId && (
          <CuratorEnrichmentSettings
            curatorId={filters.filterByCuratorId}
            curatorName={filters.filterByCuratorName || 'Curador'}
            open={showCuratorEnrichmentSettings}
            onOpenChange={setShowCuratorEnrichmentSettings}
          />
        )}
      </Suspense>

      {photoUploadLocation && (
        <LocationPhotoMenu
          locationId={photoUploadLocation.id}
          locationName={photoUploadLocation.name}
          locationCoordinates={photoUploadLocation.coordinates}
          hasUserImage={false}
          isAdminOrMaster={isMaster()}
          onPhotoUpdated={() => setPhotoUploadLocation(null)}
          defaultVisibility="private"
        />
      )}

      <FloatingPanel title="Itinerarios" icon={<List className="w-4 h-4 text-primary" />} isOpen={routeOrch.showRoutesPanel && !routeOrch.showRouteBuilder} onClose={() => routeOrch.setShowRoutesPanel(false)} position="right">
        <RoutesListPanel
          onCreateNew={routeOrch.handleCreateRoute}
          onEditRoute={routeOrch.handleEditRoute}
          visibleRouteIds={routeOrch.visibleRouteIds}
          onToggleVisibility={routeOrch.handleToggleRouteVisibility}
        />
      </FloatingPanel>

      <FloatingPanel
        title={routeOrch.editRouteId ? "Editar Itinerario" : "Crear Itinerario"}
        icon={<List className="w-4 h-4 text-primary" />}
        isOpen={routeOrch.showRouteBuilder}
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
