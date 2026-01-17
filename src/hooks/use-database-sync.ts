import { useEffect, useCallback, useState } from 'react';
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
    placeType: loc.place_type as GeoLocation['placeType'] || undefined,
    customData: (loc.custom_data as Record<string, string>) || undefined,
    enrichedData: loc.enriched_data as unknown as EnrichedLocationData || undefined,
    visibility: loc.visibility as GeoLocation['visibility'] || 'followers',
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

export function useDatabaseSync() {
  const { documents, addDocument, clearAllDocuments } = useLocationsStore();
  const [isLoading, setIsLoading] = useState(true);

  // Load documents from database
  const loadFromDatabase = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch all documents (RLS will filter based on user)
      const { data: dbDocs, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      if (!dbDocs || dbDocs.length === 0) {
        clearAllDocuments();
        setIsLoading(false);
        return;
      }

      // Fetch all locations with pagination
      const dbLocations = await fetchAllLocationsPaginated();

      // Clear current state and rebuild from database
      clearAllDocuments();

      // Group locations by document_id
      const locationsByDoc = new Map<string, GeoLocation[]>();
      dbLocations.forEach(loc => {
        const docId = loc.document_id;
        if (!docId) return;
        
        const geoLoc = dbLocationToGeoLocation(loc);

        if (!locationsByDoc.has(docId)) {
          locationsByDoc.set(docId, []);
        }
        locationsByDoc.get(docId)!.push(geoLoc);
      });

      // Add documents with their locations
      dbDocs.forEach(doc => {
        const kmlDoc: KMLDocument = {
          id: doc.id,
          name: doc.name,
          fileName: doc.original_filename || doc.name,
          locations: locationsByDoc.get(doc.id) || [],
          uploadedAt: new Date(doc.created_at),
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
    } finally {
      setIsLoading(false);
    }
  }, [addDocument, clearAllDocuments]);

  // Wait for auth to be ready before loading data
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      // First check if we have a session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted && session) {
        await loadFromDatabase();
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Reload data when user signs in
          await loadFromDatabase();
        } else if (event === 'SIGNED_OUT') {
          // Clear data when user signs out
          clearAllDocuments();
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

  return { loadFromDatabase, isLoading };
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
