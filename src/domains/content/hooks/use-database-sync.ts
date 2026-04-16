// Domain: Content — reactive hook that loads documents + locations from DB
// Phase 6: Parallel loading — own docs first, then followed/curator in background
import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument } from '@/types/location';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';
import { dbLocationToGeoLocation, fetchAllLocationsPaginated } from '../lib/db-transformers';

export type SyncPhase = 'idle' | 'own' | 'social' | 'done';

export function useDatabaseSync(userId?: string | null) {
  const { addDocument, _resetStoreState } = useLocationsStore();
  const hasLoadedRef = useRef(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');

  const loadFromDatabase = useCallback(async () => {
    try {
      console.log('[useDatabaseSync] Starting parallel load...');
      setSyncPhase('own');

      // Get current user and sync to store immediately
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const currentUserId = currentUser?.id;
      if (currentUserId) {
        useLocationsStore.getState().setCurrentUserId(currentUserId);
      }

      // Fetch all documents (RLS handles visibility)
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

      // Separate own docs vs others
      const ownDocs = dbDocs.filter(d => d.user_id === currentUserId);
      const otherDocs = dbDocs.filter(d => d.user_id !== currentUserId);

      // Fetch profiles + curator info in parallel
      const ownerIds = [...new Set(dbDocs.map(d => d.user_id).filter(Boolean))] as string[];
      const docIds = dbDocs.map(d => d.id);

      const [profilesMap, curatorDocMap] = await Promise.all([
        fetchProfiles(ownerIds),
        fetchCuratorInfo(docIds),
      ]);

      // Fetch all locations with pagination
      console.log('[useDatabaseSync] Fetching locations...');
      const dbLocations = await fetchAllLocationsPaginated();
      console.log('[useDatabaseSync] Locations fetched:', dbLocations.length);

      // Build adopted set
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

      // Group locations by document
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

      // Helper to build KMLDocument
      const buildDoc = (doc: typeof dbDocs[0]): KMLDocument => {
        const profile = doc.user_id ? profilesMap.get(doc.user_id) : undefined;
        const curatorInfo = curatorDocMap.get(doc.id);
        return {
          id: doc.id,
          name: doc.name,
          fileName: doc.original_filename || doc.name,
          locations: locationsByDoc.get(doc.id) || [],
          status: doc.status || 'draft',
          uploadedAt: new Date(doc.created_at),
          userId: doc.user_id || undefined,
          ownerName: profile?.display_name || profile?.username || undefined,
          curatorId: curatorInfo?.curatorId,
          curatorIcon: curatorInfo?.curatorIcon,
          curatorColor: curatorInfo?.curatorColor,
          curatorAvatar: curatorInfo?.curatorAvatar,
        };
      };

      // PHASE 1: Load own documents immediately
      _resetStoreState();
      let ownLocCount = 0;
      ownDocs.forEach(doc => {
        const kmlDoc = buildDoc(doc);
        ownLocCount += kmlDoc.locations.length;
        addDocument(kmlDoc);
      });

      if (ownDocs.length > 0) {
        console.log(`[useDatabaseSync] Own data loaded: ${ownDocs.length} docs, ${ownLocCount} locations`);
      }

      // PHASE 2: Load social/curator documents
      setSyncPhase('social');

      // Use microtask to let React render own docs first
      await new Promise(resolve => setTimeout(resolve, 0));

      let otherLocCount = 0;
      otherDocs.forEach(doc => {
        const kmlDoc = buildDoc(doc);
        otherLocCount += kmlDoc.locations.length;
        addDocument(kmlDoc);
      });

      setSyncPhase('done');

      const totalLocs = ownLocCount + otherLocCount;
      if (totalLocs > 0) {
        toast.success(`${dbDocs.length} documento(s) y ${totalLocs.toLocaleString()} ubicaciones cargadas`);
      }
    } catch (error) {
      console.error('Error loading from database:', error);
      toast.error('Error al cargar datos guardados');
      setSyncPhase('done');
    }
  }, [addDocument, _resetStoreState]);

  // Auth listener
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
      hasLoadedRef.current = false;
      loadFromDatabase().then(() => { hasLoadedRef.current = true; });
    };
    window.addEventListener('reload-locations', handleReloadRequest);

    loadData();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('reload-locations', handleReloadRequest);
    };
  }, [loadFromDatabase, _resetStoreState]);

  return { loadFromDatabase, syncPhase };
}

// --- Helper functions ---

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

async function fetchCuratorInfo(docIds: string[]) {
  const curatorDocMap = new Map<string, { curatorId: string; curatorIcon?: string; curatorColor?: string; curatorAvatar?: string }>();
  if (docIds.length === 0) return curatorDocMap;

  const { data: curatorDocs } = await supabase
    .from('curator_documents')
    .select('document_id, curator_id')
    .in('document_id', docIds);

  if (curatorDocs && curatorDocs.length > 0) {
    const curatorIds = [...new Set(curatorDocs.map(cd => cd.curator_id))];

    const { data: curators } = await supabase
      .from('curators')
      .select('id, icon, color, avatar_url')
      .in('id', curatorIds);

    const curatorsMap = new Map<string, { icon?: string; color?: string; avatar_url?: string }>();
    if (curators) {
      curators.forEach(c => curatorsMap.set(c.id, { icon: c.icon || undefined, color: c.color || undefined, avatar_url: c.avatar_url || undefined }));
    }

    curatorDocs.forEach(cd => {
      const info = curatorsMap.get(cd.curator_id);
      curatorDocMap.set(cd.document_id, {
        curatorId: cd.curator_id,
        curatorIcon: info?.icon,
        curatorColor: info?.color,
        curatorAvatar: info?.avatar_url,
      });
    });
  }

  return curatorDocMap;
}
