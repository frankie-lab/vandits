// Domain: Content — reactive hook that loads documents + locations from DB
import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument } from '@/types/location';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { toast } from 'sonner';
import { dbLocationToGeoLocation, fetchAllLocationsPaginated } from '../lib/db-transformers';
import { startLoading, updateLoading, endLoading } from '@/shared/loading';
import { bootMark, bootMeasure, bootSummary } from '@/shared/perf/boot-perf';

export type SyncPhase = 'idle' | 'own' | 'social' | 'done';

export function useDatabaseSync(userId?: string | null) {
  const { addDocument, applyCatalogSnapshot, setDetachedVisibleLocations, _resetStoreState } = useLocationsStore();
  const hasLoadedRef = useRef(false);
  const reloadInFlightRef = useRef<Promise<void> | null>(null);
  const reloadQueuedRef = useRef(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');

  const loadFromDatabase = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    // Card bloqueante SOLO en cold start real (store vacío). Si ya hay docs en
    // memoria, mostramos progreso superior pero el mapa permanece interactivo.
    // Ver mem://ui/loading-feedback-system y plan delta-merge.
    const storeHadDocs = useLocationsStore.getState().documents.length > 0;
    const blocking = !silent && !storeHadDocs;
    let loadingActive = false;
    const ensureEndLoading = () => {
      if (loadingActive) {
        endLoading('db-sync');
        loadingActive = false;
      }
    };
    if (!silent) {
      startLoading(
        'db-sync',
        blocking ? 'Cargando catálogo' : 'Sincronizando catálogo',
        { blocking },
      );
      loadingActive = true;
    }
    try {
      console.log('[useDatabaseSync] Starting parallel load...');
      setSyncPhase('own');

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const currentUserId = currentUser?.id;
      if (currentUserId) {
        useLocationsStore.getState().setCurrentUserId(currentUserId);
      }

      const { data: dbDocs, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      if (!dbDocs || dbDocs.length === 0) {
        console.log('[useDatabaseSync] No documents found, clearing state');
        _resetStoreState();
        setSyncPhase('done');
        return;
      }

      const ownDocs = dbDocs.filter(d => d.user_id === currentUserId);
      const otherDocs = dbDocs.filter(d => d.user_id !== currentUserId);

      const ownerIds = [...new Set(dbDocs.map(d => d.user_id).filter(Boolean))] as string[];
      const profilesMap = await fetchProfiles(ownerIds);

      console.log('[useDatabaseSync] Fetching locations...');
      const dbLocations = await fetchAllLocationsPaginated({
        withCount: !silent,
        onPage: silent
          ? undefined
          : (loaded, total) => {
              updateLoading('db-sync', loaded, total ?? undefined);
            },
      });
      console.log('[useDatabaseSync] Locations fetched:', dbLocations.length);

      // [TEMP DEBUG] expose a lite snapshot for the user-filter funnel.
      // Transversal (no hardcodes): array of { id, document_id, owner_user_id }.
      // Removed once the user-filter pipeline is verified.
      try {
        (window as any).__dbSyncSnapshot__ = {
          ts: Date.now(),
          docs: dbDocs.map(d => ({ id: d.id, user_id: d.user_id })),
          locs: dbLocations.map((l: any) => ({
            id: l.id,
            document_id: l.document_id ?? null,
            owner_user_id: l.owner_user_id ?? null,
          })),
        };
      } catch { /* ignore */ }

      const allDocIds = new Set(dbDocs.map(d => d.id));
      const adoptedFromIds = new Set<string>();
      const userDocIds = new Set(ownDocs.map(d => d.id));

      dbLocations.forEach(loc => {
        if (userDocIds.has(loc.document_id)) {
          const customData = loc.custom_data as Record<string, any> | null;
          if (customData?.adopted_from) {
            adoptedFromIds.add(customData.adopted_from);
          }
        }
      });

      const locationsByDoc = new Map<string, GeoLocation[]>();
      dbLocations.forEach(loc => {
        const docId = loc.document_id;
        if (!docId) return;

        const isOwnDoc = userDocIds.has(docId);
        if (!isOwnDoc && adoptedFromIds.has(loc.id)) return;

        const geoLoc = dbLocationToGeoLocation(loc);
        if (!locationsByDoc.has(docId)) locationsByDoc.set(docId, []);
        locationsByDoc.get(docId)!.push(geoLoc);
      });

      const detachedVisibleLocations = dbLocations
        .filter((loc) => !loc.document_id || !allDocIds.has(loc.document_id))
        .map(dbLocationToGeoLocation);

      const buildDoc = (doc: typeof dbDocs[0]): KMLDocument => {
        const profile = doc.user_id ? profilesMap.get(doc.user_id) : undefined;
        return {
          id: doc.id,
          name: doc.name,
          fileName: doc.original_filename || doc.name,
          locations: locationsByDoc.get(doc.id) || [],
          status: doc.status || 'draft',
          uploadedAt: new Date(doc.created_at),
          userId: doc.user_id || undefined,
          ownerName: profile?.display_name || profile?.username || undefined,
        };
      };

      // Delta merge en dos pasos con scope (mine → social). El primer paso NO
      // toca docs sociales del store; el segundo NO toca los míos. Así nunca
      // hay un instante con catálogo vacío y los markers no parpadean.
      const ownKmlDocs = ownDocs.map(buildDoc);
      const otherKmlDocs = otherDocs.map(buildDoc);
      const ownLocCount = ownKmlDocs.reduce((acc, d) => acc + d.locations.length, 0);

      setDetachedVisibleLocations(detachedVisibleLocations);

      applyCatalogSnapshot(ownKmlDocs, { ownerScope: 'mine', currentUserId: currentUserId ?? null });

      if (ownDocs.length > 0) {
        console.log(`[useDatabaseSync] Own data loaded: ${ownDocs.length} docs, ${ownLocCount} locations`);
      }

      // Mapa ya tiene contenido renderizable → cerramos cualquier bloqueo.
      ensureEndLoading();

      setSyncPhase('social');
      await new Promise(resolve => setTimeout(resolve, 0));

      applyCatalogSnapshot(otherKmlDocs, { ownerScope: 'social', currentUserId: currentUserId ?? null });

      setSyncPhase('done');
      // Load summary is shown in the welcome card on the map (no toast to avoid duplication)
    } catch (error: any) {
      console.error('Error loading from database:', error);
      if (error?.code === '57014') {
        toast.error('La carga del catálogo está tardando demasiado', {
          description: 'Vuelve a intentarlo en unos segundos.',
          action: {
            label: 'Reintentar',
            onClick: () => window.dispatchEvent(new Event('reload-locations')),
          },
        });
      } else {
        toast.error('Error al cargar datos guardados');
      }
      setSyncPhase('done');
    } finally {
      ensureEndLoading();
    }
  }, [addDocument, _resetStoreState, setDetachedVisibleLocations]);

  const requestGlobalReload = useCallback(() => {
    if (reloadInFlightRef.current) {
      reloadQueuedRef.current = true;
      return reloadInFlightRef.current;
    }

    const runReload = async () => {
      do {
        reloadQueuedRef.current = false;
        hasLoadedRef.current = false;
        await loadFromDatabase({ silent: true });
        hasLoadedRef.current = true;
      } while (reloadQueuedRef.current);
    };

    reloadInFlightRef.current = runReload().finally(() => {
      reloadInFlightRef.current = null;
    });

    return reloadInFlightRef.current;
  }, [loadFromDatabase]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session && !hasLoadedRef.current) {
        hasLoadedRef.current = true;
        await loadFromDatabase();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT') {
          hasLoadedRef.current = false;
          _resetStoreState();
          setSyncPhase('idle');
          return;
        }
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          if (event === 'SIGNED_IN') hasLoadedRef.current = false;
          setTimeout(() => {
            if (!mounted || hasLoadedRef.current) return;
            hasLoadedRef.current = true;
            loadFromDatabase();
          }, 0);
        }
      }
    );

    const handleReloadRequest = () => {
      void requestGlobalReload();
    };
    window.addEventListener('reload-locations', handleReloadRequest);
    window.addEventListener('locations-updated', handleReloadRequest);

    loadData();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('reload-locations', handleReloadRequest);
      window.removeEventListener('locations-updated', handleReloadRequest);
    };
  }, [requestGlobalReload, _resetStoreState]);

  return { loadFromDatabase, syncPhase };
}

async function fetchProfiles(ownerIds: string[]) {
  const profilesMap = new Map<string, { display_name: string | null; username: string }>();
  if (ownerIds.length === 0) return profilesMap;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', ownerIds);

  if (profiles) {
    profiles.forEach(p => profilesMap.set(p.id, { display_name: p.display_name, username: p.username }));
  }
  return profilesMap;
}
