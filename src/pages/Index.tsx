import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Filter, List, Volume2, User, Compass, Shield, MapPin, Users, FolderOpen, Tag, Cloud, Layers } from 'lucide-react';
import { SoundSettingsPanel } from '@/components/SoundSettingsPanel';
import { FileUploadZone } from '@/domains/content/components';
import { ExportPanel } from '@/domains/content/components';
import { BatchEnrichmentPanel } from '@/domains/content/components';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { NotesEditor } from '@/components/NotesEditor';
import { LocationPhotoMenu } from '@/components/LocationPhotoMenu';
import { RoutesListPanel } from '@/components/RoutesListPanel';
import { DocumentsPanel } from '@/domains/content/components';
import { PersonalCategoriesPanel } from '@/components/PersonalCategoriesPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';
import { Route as RouteType, useRoutes } from '@/hooks/use-routes';
import { useLocationsStore } from '@/store/locations-store';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { useRealtimeLocations } from '@/hooks/use-realtime-locations';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
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
import { useRouteOrchestration } from '@/domains/routes/hooks/use-route-orchestration';

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
  const { isMaster } = usePermissions();

  // ─── Non-discovery panel states ──────────────────────────────────────────
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showCriteriaConfig, setShowCriteriaConfig] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileEditorTab, setProfileEditorTab] = useState<string | undefined>(undefined);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPanelTab, setAdminPanelTab] = useState<string | undefined>(undefined);
  const [showUsersSidebar, setShowUsersSidebar] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showOneDrivePhotos, setShowOneDrivePhotos] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // ─── Content-specific states ──────────────────────────────────────────────
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  const [notesLocation, setNotesLocation] = useState<GeoLocation | null>(null);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [pendingValidationsCount, setPendingValidationsCount] = useState(0);
  const [pendingValidationNames, setPendingValidationNames] = useState<string[]>([]);
  const [photoUploadLocation, setPhotoUploadLocation] = useState<{ id: string; name: string; coordinates: { lat: number; lng: number } } | null>(null);
  const [activeDocumentView, setActiveDocumentView] = useState<{
    docId: string;
    docName?: string;
    routeIds?: string[];
    matchingCatalogIds?: string[];
  } | null>(null);

  // ─── Discovery controls ref ──────────────────────────────────────────────
  const discoveryControlsRef = useRef<DiscoveryControls | null>(null);
  const handleDiscoveryControlsReady = useCallback((controls: DiscoveryControls) => {
    discoveryControlsRef.current = controls;
  }, []);

  const { routes: allRoutes } = useRoutes();

  // ─── Data sync ────────────────────────────────────────────────────────────
  const { loadFromDatabase } = useDatabaseSync(user?.id);
  useRealtimeLocations();

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const routeOrch = useRouteOrchestration(allRoutes);

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
    const handleOpenCategories = () => setShowCategories(true);
    window.addEventListener('import:open-categories', handleOpenCategories);
    return () => window.removeEventListener('import:open-categories', handleOpenCategories);
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

  // Persist active document focus
  useEffect(() => {
    const handleDocumentView = (e: CustomEvent<{ docId?: string; docName?: string; routeIds?: string[]; matchingCatalogIds?: string[] } | null>) => {
      const detail = e.detail;
      if (!detail?.docId) {
        setActiveDocumentView(null);
        return;
      }
      setActiveDocumentView({
        docId: detail.docId,
        docName: detail.docName,
        routeIds: detail.routeIds || [],
        matchingCatalogIds: detail.matchingCatalogIds || [],
      });
    };
    window.addEventListener('document:view-on-map', handleDocumentView as EventListener);
    return () => window.removeEventListener('document:view-on-map', handleDocumentView as EventListener);
  }, []);

  useEffect(() => {
    if (!activeDocumentView) {
      useLocationsStore.getState().setFilters({
        filterByDocumentId: undefined,
        filterByDocumentName: undefined,
        filterByDocumentMatchIds: undefined,
      });
      routeOrch.setVisibleRouteIds(new Set());
      return;
    }

    const parentRouteIds = allRoutes
      .filter(route => route.sourceDocumentId === activeDocumentView.docId)
      .map(route => route.id);
    const childRouteIds = allRoutes
      .filter(route => route.parentRouteId && parentRouteIds.includes(route.parentRouteId))
      .map(route => route.id);
    const resolvedRouteIds = [...parentRouteIds, ...childRouteIds];
    const nextRouteIds = resolvedRouteIds.length > 0
      ? resolvedRouteIds
      : (activeDocumentView.routeIds || []);

    useLocationsStore.getState().setFilters({
      filterByDocumentId: activeDocumentView.docId,
      filterByDocumentName: activeDocumentView.docName,
      filterByDocumentMatchIds: activeDocumentView.matchingCatalogIds,
    });
    routeOrch.setVisibleRouteIds(new Set(nextRouteIds));
  }, [activeDocumentView, allRoutes, routeOrch.setVisibleRouteIds]);

  useEffect(() => {
    const handleStatusVisibility = (e: CustomEvent<{ visibleStatuses: Record<string, boolean>; docs: { id: string; status: string }[] }>) => {
      const { visibleStatuses, docs } = e.detail;
      const hiddenIds = docs.filter(d => !visibleStatuses[d.status]).map(d => d.id);
      useLocationsStore.getState().setFilters({ hiddenDocumentIds: hiddenIds.length > 0 ? hiddenIds : undefined });
    };
    window.addEventListener('document:status-visibility', handleStatusVisibility as EventListener);
    return () => window.removeEventListener('document:status-visibility', handleStatusVisibility as EventListener);
  }, []);

  useEffect(() => {
    const handleRouteToggle = (e: CustomEvent<{ routeId: string }>) => {
      const { routeId } = e.detail;
      routeOrch.setVisibleRouteIds(prev => {
        const next = new Set(prev);
        if (next.has(routeId)) next.delete(routeId); else next.add(routeId);
        return next;
      });
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.routeGeometry?.coordinates?.length) {
        const coords = route.routeGeometry.coordinates as number[][];
        const lats = coords.map((c: number[]) => c[1]);
        const lngs = coords.map((c: number[]) => c[0]);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },
        }));
      }
    };
    window.addEventListener('route:toggle-visibility', handleRouteToggle as EventListener);
    return () => window.removeEventListener('route:toggle-visibility', handleRouteToggle as EventListener);
  }, [allRoutes, routeOrch.setVisibleRouteIds]);

  useEffect(() => {
    const handleRouteFocus = (e: CustomEvent<{ routeId: string }>) => {
      const { routeId } = e.detail;
      routeOrch.setVisibleRouteIds(prev => {
        const next = new Set(prev);
        next.add(routeId);
        return next;
      });
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.routeGeometry?.coordinates?.length) {
        const coords = route.routeGeometry.coordinates as number[][];
        const lats = coords.map((c: number[]) => c[1]);
        const lngs = coords.map((c: number[]) => c[0]);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },
        }));
      } else {
        supabase.from('route_waypoints')
          .select('latitude, longitude')
          .eq('route_id', routeId)
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
    };
    window.addEventListener('route:focus', handleRouteFocus as EventListener);
    return () => window.removeEventListener('route:focus', handleRouteFocus as EventListener);
  }, [allRoutes, routeOrch.setVisibleRouteIds]);

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
          isOpen={showUsersSidebar}
          onClose={() => setShowUsersSidebar(false)}
          onOpen={() => setShowUsersSidebar(true)}
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
        onToggleExport={() => setShowExportPanel(true)}
        onToggleBatchEnrich={() => setShowBatchEnrichment(true)}
        onToggleCriteriaConfig={() => setShowCriteriaConfig(true)}
        onToggleGallery={() => dc?.toggleGallery()}
        onToggleSemanticSearch={() => dc?.toggleSemanticSearch()}
        onToggleDuplicates={() => dc?.toggleDuplicates()}
        onToggleIncomplete={() => dc?.toggleIncomplete()}
        onUploadClick={() => setShowUploadDialog(true)}
        onOpenProfile={(tab) => { setProfileEditorTab(tab); setShowProfileEditor(true); }}
        onOpenRouteSettings={() => routeOrch.setShowRouteSettings(true)}
        onOpenAdmin={(tab) => { setAdminPanelTab(tab); setShowAdminPanel(true); }}
        onOpenUsers={() => setShowUsersSidebar(true)}
        onOpenTrash={() => setShowTrash(true)}
        onOpenSoundSettings={() => setShowSoundSettings(true)}
        onOpenDocuments={() => setShowDocuments(true)}
        onOpenOneDrivePhotos={() => setShowOneDrivePhotos(true)}
        onOpenCategories={() => setShowCategories(true)}
        onOpenLayers={() => dc?.toggleLayers()}
        onToggleRoutes={() => routeOrch.setShowRoutesPanel(prev => !prev)}
        filtersOpen={dc?.filtersOpen ?? false}
        locationsOpen={dc?.locationsOpen ?? false}
        activeFilterCount={dc?.activeFilterCount ?? 0}
        pendingValidationsCount={pendingValidationsCount}
        pendingValidationNames={pendingValidationNames}
        key={criteriaVersion}
      />

      {/* Content panels */}
      <FloatingPanel title="Notificaciones" icon={<Volume2 className="w-4 h-4 text-primary" />} isOpen={showSoundSettings} onClose={() => setShowSoundSettings(false)} position="right">
        <SoundSettingsPanel />
      </FloatingPanel>

      <FloatingPanel title="Documentos importados" icon={<FolderOpen className="w-4 h-4 text-primary" />} isOpen={showDocuments} onClose={() => setShowDocuments(false)} position="right">
        <DocumentsPanel />
      </FloatingPanel>

      <FloatingPanel title="Fotos en OneDrive" icon={<Cloud className="w-4 h-4 text-blue-500" />} isOpen={showOneDrivePhotos} onClose={() => setShowOneDrivePhotos(false)} position="right">
        <OneDrivePhotosPanel />
      </FloatingPanel>

      <FloatingPanel title="Categorías personales" icon={<Tag className="w-4 h-4 text-primary" />} isOpen={showCategories} onClose={() => setShowCategories(false)} position="right">
        <PersonalCategoriesPanel />
      </FloatingPanel>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">Subir archivos de destinos</DialogTitle>
          </DialogHeader>
          <FileUploadZone onUploadComplete={() => setShowUploadDialog(false)} />
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

      <FloatingPanel title="Itinerarios" icon={<List className="w-4 h-4 text-primary" />} isOpen={routeOrch.showRoutesPanel} onClose={() => { routeOrch.setShowRoutesPanel(false); window.dispatchEvent(new CustomEvent('itinerary-focus', { detail: { locationIds: null } })); }} position="right">
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
