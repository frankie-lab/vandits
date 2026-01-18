import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

// Constants for pagination
const PAGE_SIZE = 1000;
const MAX_LOCATIONS = 50000; // Safety limit

// Helper to transform DB location to GeoLocation
function dbLocationToGeoLocation(loc: any): GeoLocation {
  const baseCustomData = (loc.custom_data as Record<string, string>) || {};
  const mergedCustomData: Record<string, string> = {
    ...baseCustomData,
    ...(loc.user_image_url ? { user_image_url: String(loc.user_image_url) } : {}),
    ...(loc.user_image_visibility ? { user_image_visibility: String(loc.user_image_visibility) } : {}),
  };

  return {
    id: loc.id,
    name: loc.name,
    description: loc.description || undefined,
    coordinates: {
      lat: loc.latitude,
      lng: loc.longitude,
      altitude: loc.altitude || undefined,
    },
    continent: loc.continent || undefined,
    country: loc.country || undefined,
    region: loc.region || undefined,
    zone: loc.zone || undefined,
    placeType: (loc.place_type as GeoLocation['placeType']) || undefined,
    customData: Object.keys(mergedCustomData).length ? mergedCustomData : undefined,
    enrichedData: (loc.enriched_data as unknown as EnrichedLocationData) || undefined,
    visibility: (loc.visibility as GeoLocation['visibility']) || 'followers',
    createdAt: new Date(loc.created_at),
    updatedAt: new Date(loc.updated_at),
  };
}

// Fetch all locations with pagination
async function fetchAllLocationsPaginated(): Promise<any[]> {
  const allLocations: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && allLocations.length < MAX_LOCATIONS) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .range(from, to)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      allLocations.push(...data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allLocations;
}

export function useDatabaseSync(userId?: string | null) {
  const { addDocument, clearAllDocuments } = useLocationsStore();
  const hasLoadedRef = useRef(false);

  // Load documents from database
  const loadFromDatabase = useCallback(async () => {
    try {
      console.log('[useDatabaseSync] Starting to load documents...');
      
      // Fetch all documents (RLS will filter based on user)
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

      if (docsError) throw docsError;

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

      // Build a set of adopted location IDs (from current user's locations)
      // These are the original location IDs that the user has copied to their collection
      const adoptedFromIds = new Set<string>();
      const userDocIds = new Set<string>();
      
      if (currentUserId) {
        dbDocs.forEach(doc => {
          if (doc.user_id === currentUserId) {
            userDocIds.add(doc.id);
          }
        });
        
        // Collect all adopted_from IDs from user's locations
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

      // Group locations by document_id, filtering out adopted originals from followed users
      const locationsByDoc = new Map<string, GeoLocation[]>();
      dbLocations.forEach(loc => {
        const docId = loc.document_id;
        if (!docId) return;
        
        // Skip this location if it's from another user AND the current user has already adopted it
        const isOwnDoc = userDocIds.has(docId);
        if (!isOwnDoc && adoptedFromIds.has(loc.id)) {
          console.log('[useDatabaseSync] Filtering out adopted location:', loc.name);
          return; // Skip - user already has this in their collection
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
        const kmlDoc: KMLDocument = {
          id: doc.id,
          name: doc.name,
          fileName: doc.original_filename || doc.name,
          locations: locationsByDoc.get(doc.id) || [],
          uploadedAt: new Date(doc.created_at),
          userId: doc.user_id || undefined,
          ownerName: profile?.display_name || profile?.username || undefined,
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
      // First check if we have a session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[useDatabaseSync] Session check:', session ? 'authenticated' : 'not authenticated');
      
      if (mounted && session) {
        // Always load if we have a session and haven't loaded yet
        if (!hasLoadedRef.current) {
          console.log('[useDatabaseSync] First load triggered');
          hasLoadedRef.current = true;
          await loadFromDatabase();
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          hasLoadedRef.current = false;
          clearAllDocuments();
          return;
        }

        // IMPORTANT: handle INITIAL_SESSION too, otherwise data may never load on refresh
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          // Force reload on sign in
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

    // Initial load
    loadData();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadFromDatabase, clearAllDocuments]);

  return { loadFromDatabase };
}

// Save a new document to the database
export async function saveDocumentToDatabase(doc: KMLDocument): Promise<boolean> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Debes iniciar sesión para guardar documentos');
      return false;
    }

    // Insert document with user_id
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: doc.id,
        name: doc.name,
        original_filename: doc.fileName,
        user_id: user.id,
      });

    if (docError) throw docError;

    // Insert locations in batches
    const locations = doc.locations.map(loc => ({
      id: loc.id,
      document_id: doc.id,
      name: loc.name,
      description: loc.description || null,
      latitude: loc.coordinates.lat,
      longitude: loc.coordinates.lng,
      altitude: loc.coordinates.altitude || null,
      continent: loc.continent || null,
      country: loc.country || null,
      region: loc.region || null,
      zone: loc.zone || null,
      place_type: loc.placeType || null,
      custom_data: (loc.customData || {}) as unknown as Json,
      enriched_data: (loc.enrichedData || null) as unknown as Json,
      visibility: 'followers', // Default visibility for new locations
    }));

    // Insert in batches of 100
    for (let i = 0; i < locations.length; i += 100) {
      const batch = locations.slice(i, i + 100);
      const { error: locsError } = await supabase
        .from('locations')
        .insert(batch);

      if (locsError) throw locsError;
    }

    return true;
  } catch (error) {
    console.error('Error saving to database:', error);
    toast.error('Error al guardar en la base de datos');
    return false;
  }
}

// Update a single location in the database
export async function updateLocationInDatabase(location: GeoLocation): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('locations')
      .update({
        name: location.name,
        description: location.description || null,
        latitude: location.coordinates.lat,
        longitude: location.coordinates.lng,
        altitude: location.coordinates.altitude || null,
        continent: location.continent || null,
        country: location.country || null,
        region: location.region || null,
        zone: location.zone || null,
        place_type: location.placeType || null,
        custom_data: (location.customData || {}) as unknown as Json,
        enriched_data: (location.enrichedData || null) as unknown as Json,
      })
      .eq('id', location.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating location:', error);
    return false;
  }
}

// Delete a document from the database
export async function deleteDocumentFromDatabase(docId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    toast.error('Error al eliminar documento');
    return false;
  }
}

// Batch update locations (for geocoding)
export async function batchUpdateLocations(locations: GeoLocation[]): Promise<boolean> {
  try {
    for (const loc of locations) {
      await updateLocationInDatabase(loc);
    }
    return true;
  } catch (error) {
    console.error('Error batch updating locations:', error);
    return false;
  }
}

// Load locations for a specific document from the database
export async function loadLocationsFromDatabase(documentId: string): Promise<GeoLocation[]> {
  try {
    const { data: dbLocations, error } = await supabase
      .from('locations')
      .select('*')
      .eq('document_id', documentId);

    if (error) throw error;

    return (dbLocations || []).map(loc => ({
      id: loc.id,
      name: loc.name,
      description: loc.description || undefined,
      coordinates: {
        lat: loc.latitude,
        lng: loc.longitude,
        altitude: loc.altitude || undefined,
      },
      continent: loc.continent || undefined,
      country: loc.country || undefined,
      region: loc.region || undefined,
      zone: loc.zone || undefined,
      placeType: loc.place_type as GeoLocation['placeType'] || undefined,
      customData: (loc.custom_data as Record<string, string>) || undefined,
      enrichedData: loc.enriched_data as unknown as EnrichedLocationData || undefined,
      createdAt: new Date(loc.created_at),
      updatedAt: new Date(loc.updated_at),
    }));
  } catch (error) {
    console.error('Error loading locations from database:', error);
    return [];
  }
}

// Load ALL locations from the database (for duplicate detection) - with pagination
export async function loadAllLocationsFromDatabase(): Promise<GeoLocation[]> {
  try {
    const dbLocations = await fetchAllLocationsPaginated();
    return dbLocations.map(dbLocationToGeoLocation);
  } catch (error) {
    console.error('Error loading all locations from database:', error);
    return [];
  }
}
