import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

export function useDatabaseSync() {
  const { documents, addDocument, clearAllDocuments } = useLocationsStore();

  // Load documents from database on mount
  const loadFromDatabase = useCallback(async () => {
    try {
      // Fetch all documents
      const { data: dbDocs, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      if (!dbDocs || dbDocs.length === 0) return;

      // Fetch all locations
      const { data: dbLocations, error: locsError } = await supabase
        .from('locations')
        .select('*');

      if (locsError) throw locsError;

      // Clear current state and rebuild from database
      clearAllDocuments();

      // Group locations by document_id
      const locationsByDoc = new Map<string, GeoLocation[]>();
      dbLocations?.forEach(loc => {
        const docId = loc.document_id;
        if (!docId) return;
        
        const geoLoc: GeoLocation = {
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
        };

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
        toast.success(`${dbDocs.length} documento(s) cargado(s) desde la base de datos`);
      }
    } catch (error) {
      console.error('Error loading from database:', error);
      toast.error('Error al cargar datos guardados');
    }
  }, [addDocument, clearAllDocuments]);

  useEffect(() => {
    loadFromDatabase();
  }, []);

  return { loadFromDatabase };
}

// Save a new document to the database
export async function saveDocumentToDatabase(doc: KMLDocument): Promise<boolean> {
  try {
    // Insert document
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: doc.id,
        name: doc.name,
        original_filename: doc.fileName,
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
