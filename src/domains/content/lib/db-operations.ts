// Domain: Content — CRUD operations against Supabase
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { dbLocationToGeoLocation, fetchAllLocationsPaginated } from './db-transformers';

export async function saveDocumentToDatabase(
  doc: KMLDocument,
  options?: { curatorId?: string }
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Debes iniciar sesión para guardar documentos');
      return false;
    }

    const documentUserId = options?.curatorId ? null : user.id;

    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: doc.id,
        name: doc.name,
        original_filename: doc.fileName,
        user_id: documentUserId,
      });

    if (docError) throw docError;

    if (options?.curatorId) {
      const { error: curatorDocError } = await supabase
        .from('curator_documents')
        .insert({
          curator_id: options.curatorId,
          document_id: doc.id,
        });

      if (curatorDocError) {
        console.error('Error linking document to curator:', curatorDocError);
        throw curatorDocError;
      }
      console.log('[saveDocumentToDatabase] Linked document to curator:', options.curatorId);
    }

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
      visibility: options?.curatorId ? 'public' : 'followers',
      is_approved: false, // New imports require explicit approval
    }));

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

export async function loadAllLocationsFromDatabase(): Promise<GeoLocation[]> {
  try {
    const dbLocations = await fetchAllLocationsPaginated();
    return dbLocations.map(dbLocationToGeoLocation);
  } catch (error) {
    console.error('Error loading all locations from database:', error);
    return [];
  }
}
