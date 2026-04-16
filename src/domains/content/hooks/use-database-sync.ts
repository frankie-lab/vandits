// Domain: Content — reactive hook that loads documents + locations from DB
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
      const dbLocations = await fetchAllLocationsPaginated();
      console.log('[useDatabaseSync] Locations fetched:', dbLocations.length);

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

      setSyncPhase('social');
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
