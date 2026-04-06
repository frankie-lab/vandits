// Domain: Content — reactive hook that loads documents + locations from DB
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument } from '@/types/location';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';
import { dbLocationToGeoLocation, fetchAllLocationsPaginated } from '../lib/db-transformers';

export function useDatabaseSync(userId?: string | null) {
  const { addDocument, clearAllDocuments } = useLocationsStore();
  const hasLoadedRef = useRef(false);

  const loadFromDatabase = useCallback(async () => {
    try {
      console.log('[useDatabaseSync] Starting to load documents...');

      const { data: dbDocs, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('[useDatabaseSync] Documents fetched:', dbDocs?.length, 'Error:', docsError);

      if (docsError) throw docsError;

      // Fetch profile info for document owners
      const ownerIds = [...new Set((dbDocs || []).map(d => d.user_id).filter(Boolean))] as string[];
      const profilesMap = new Map<string, { display_name: string | null; username: string }>();

      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', ownerIds);

        if (profiles) {
          profiles.forEach(p => profilesMap.set(p.id, { display_name: p.display_name, username: p.username }));
        }
      }

      // Fetch curator-document relationships and curator info
      const docIds = (dbDocs || []).map(d => d.id);
      const curatorDocMap = new Map<string, { curatorId: string; curatorIcon?: string; curatorColor?: string; curatorAvatar?: string }>();

      if (docIds.length > 0) {
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
            const curatorInfo = curatorsMap.get(cd.curator_id);
            curatorDocMap.set(cd.document_id, {
              curatorId: cd.curator_id,
              curatorIcon: curatorInfo?.icon,
              curatorColor: curatorInfo?.color,
              curatorAvatar: curatorInfo?.avatar_url,
            });
          });
        }
      }

      if (!dbDocs || dbDocs.length === 0) {
        console.log('[useDatabaseSync] No documents found, clearing state');
        clearAllDocuments();
        return;
      }

      // Fetch all locations with pagination
      console.log('[useDatabaseSync] Fetching locations...');
      const dbLocations = await fetchAllLocationsPaginated();
      console.log('[useDatabaseSync] Locations fetched:', dbLocations.length);

      // Get current user's ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const currentUserId = currentUser?.id;

      // Build a set of adopted location IDs
      const adoptedFromIds = new Set<string>();
      const userDocIds = new Set<string>();

      if (currentUserId) {
        dbDocs.forEach(doc => {
          if (doc.user_id === currentUserId) {
            userDocIds.add(doc.id);
          }
        });

        dbLocations.forEach(loc => {
          if (userDocIds.has(loc.document_id)) {
            const customData = loc.custom_data as Record<string, any> | null;
            if (customData?.adopted_from) {
              adoptedFromIds.add(customData.adopted_from);
            }
          }
        });
      }

      console.log('[useDatabaseSync] Adopted IDs to filter:', adoptedFromIds.size);

      // Clear current state and rebuild from database
      clearAllDocuments();

      // Group locations by document_id, filtering out adopted originals
      const locationsByDoc = new Map<string, GeoLocation[]>();
      dbLocations.forEach(loc => {
        const docId = loc.document_id;
        if (!docId) return;

        const isOwnDoc = userDocIds.has(docId);
        if (!isOwnDoc && adoptedFromIds.has(loc.id)) {
          console.log('[useDatabaseSync] Filtering out adopted location:', loc.name);
          return;
        }

        const geoLoc = dbLocationToGeoLocation(loc);

        if (!locationsByDoc.has(docId)) {
          locationsByDoc.set(docId, []);
        }
        locationsByDoc.get(docId)!.push(geoLoc);
      });

      // Add documents with their locations
      dbDocs.forEach(doc => {
        const profile = doc.user_id ? profilesMap.get(doc.user_id) : undefined;
        const curatorInfo = curatorDocMap.get(doc.id);
        const kmlDoc: KMLDocument = {
          id: doc.id,
          name: doc.name,
          fileName: doc.original_filename || doc.name,
          locations: locationsByDoc.get(doc.id) || [],
          uploadedAt: new Date(doc.created_at),
          userId: doc.user_id || undefined,
          ownerName: profile?.display_name || profile?.username || undefined,
          curatorId: curatorInfo?.curatorId,
          curatorIcon: curatorInfo?.curatorIcon,
          curatorColor: curatorInfo?.curatorColor,
          curatorAvatar: curatorInfo?.curatorAvatar,
        };
        addDocument(kmlDoc);
      });

      if (dbDocs.length > 0) {
        const totalLocs = dbLocations.length;
        toast.success(`${dbDocs.length} documento(s) y ${totalLocs.toLocaleString()} ubicaciones cargadas`);
      }
    } catch (error) {
      console.error('Error loading from database:', error);
      toast.error('Error al cargar datos guardados');
    }
  }, [addDocument, clearAllDocuments]);

  // Wait for auth to be ready before loading data
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[useDatabaseSync] Session check:', session ? 'authenticated' : 'not authenticated');

      if (mounted && session) {
        if (!hasLoadedRef.current) {
          console.log('[useDatabaseSync] First load triggered');
          hasLoadedRef.current = true;
          await loadFromDatabase();
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          hasLoadedRef.current = false;
          clearAllDocuments();
          return;
        }

        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          if (event === 'SIGNED_IN') {
            hasLoadedRef.current = false;
          }

          setTimeout(() => {
            if (!mounted) return;
            if (hasLoadedRef.current) return;
            hasLoadedRef.current = true;
            loadFromDatabase();
          }, 0);
        }
      }
    );

    const handleReloadRequest = () => {
      console.log('[useDatabaseSync] Reload requested via event');
      hasLoadedRef.current = false;
      loadFromDatabase().then(() => {
        hasLoadedRef.current = true;
      });
    };
    window.addEventListener('reload-locations', handleReloadRequest);

    loadData();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('reload-locations', handleReloadRequest);
    };
  }, [loadFromDatabase, clearAllDocuments]);

  return { loadFromDatabase };
}
