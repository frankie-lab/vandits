// Domain: Content — CRUD operations against Supabase
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { dbLocationToGeoLocation, fetchAllLocationsPaginated } from './db-transformers';
import { resolveAllFks } from '@/shared/geography/resolve-admin-fks';
import { geocodeLocations } from '@/shared/geography/geocode-batch';

export async function saveDocumentToDatabase(
  doc: KMLDocument,
  options?: { rawFile?: File; matchingPointIds?: string[]; matchingPointNames?: Record<string, string>; sourceType?: 'kml' | 'gpx' | 'geojson' | 'csv' }
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Debes iniciar sesión para guardar documentos');
      return false;
    }

    const documentUserId = user.id;

    // Upload original file to storage if provided
    let originalFilePath: string | null = null;
    if (options?.rawFile) {
      const filePath = `${user.id}/${doc.id}/${options.rawFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('document-originals')
        .upload(filePath, options.rawFile);
      if (uploadError) {
        console.warn('[saveDocumentToDatabase] Could not upload original file:', uploadError.message);
      } else {
        originalFilePath = filePath;
      }
    }

    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: doc.id,
        name: doc.name,
        original_filename: doc.fileName,
        user_id: documentUserId,
        original_file_path: originalFilePath,
        source_type: options?.sourceType ?? null,
        import_status: 'reviewing',
      } as any);

    if (docError) throw docError;


    const matchingSet = new Set(options?.matchingPointIds || []);
    const nameMap = options?.matchingPointNames || {};

    // Geocode any points that arrived without valid coordinates BEFORE inserting
    // so they show up on the map at the right place. Helper único transversal.
    const geo = await geocodeLocations(doc.locations);
    const docLocations = geo.locations;
    if (geo.geocodedCount > 0) {
      console.info(`[saveDocumentToDatabase] geocoded ${geo.geocodedCount} points; ${geo.pendingCount} still pending`);
    }

    // Resolve FKs (admin chain + place type) for every location in parallel.
    // resolveAllFks is cached in-memory, so repeated chains hit the network
    // only once during a single import.
    const fksByIndex = await Promise.all(
      docLocations.map((loc) =>
        resolveAllFks({
          continent: loc.continent,
          country: loc.country,
          region: loc.region,
          zone: loc.zone,
          placeTypeCode: loc.placeType,
        }).catch(() => ({
          continent_id: null, country_id: null, region_id: null, zone_id: null,
          admin3_id: null, locality_id: null, sublocality_id: null, type_id: null,
        })),
      ),
    );

    const locations = doc.locations.map((loc, i) => {
      const fks = fksByIndex[i];
      return {
        id: loc.id,
        document_id: doc.id,
        name: nameMap[loc.id] || loc.name,
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
        visibility: 'followers',
        is_approved: matchingSet.has(loc.id),
        type_id: fks.type_id,
        continent_id: fks.continent_id,
        country_id: fks.country_id,
        region_id: fks.region_id,
        zone_id: fks.zone_id,
        admin3_id: fks.admin3_id,
        locality_id: fks.locality_id,
        sublocality_id: fks.sublocality_id,
      };
    });

    for (let i = 0; i < locations.length; i += 100) {
      const batch = locations.slice(i, i + 100);
      const { error: locsError } = await supabase
        .from('locations')
        .insert(batch);

      if (locsError) throw locsError;
    }

    // Fire-and-forget: backfill admin FKs for any points that arrived without
    // country/region strings (only lat/lng). Reverse-geocodes via Nominatim
    // and fills the geographic hierarchy. Transversal — runs for every import.
    void supabase.functions.invoke('backfill-admin-fks', { body: { limit: 200 } })
      .catch(err => console.warn('[saveDocumentToDatabase] backfill-admin-fks failed:', err));

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
        is_approved: location.isApproved ?? false,
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
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch original_file_path before deleting the row (to clean up storage)
    const { data: docRow } = await supabase
      .from('documents')
      .select('original_file_path')
      .eq('id', docId)
      .maybeSingle();

    // Delete document row.
    // Note: locations.document_id FK is now ON DELETE SET NULL, so imported
    // points are preserved as manual user points (owner_user_id keeps ownership).
    // document_tracks still cascade — those are file geometry, not user points.
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId);

    if (error) throw error;

    // Best-effort cleanup of the original raw file in storage
    if (user && docRow?.original_file_path) {
      const { error: storageError } = await supabase.storage
        .from('document-originals')
        .remove([docRow.original_file_path]);
      if (storageError) {
        console.warn('[deleteDocumentFromDatabase] Could not remove raw file:', storageError.message);
      }
    } else if (user) {
      // Fallback: try to remove the entire folder for this doc
      const folder = `${user.id}/${docId}`;
      const { data: list } = await supabase.storage
        .from('document-originals')
        .list(folder);
      if (list && list.length > 0) {
        await supabase.storage
          .from('document-originals')
          .remove(list.map(f => `${folder}/${f.name}`));
      }
    }

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

export async function deleteAllUserDocuments(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Debes iniciar sesión para eliminar documentos');
      return false;
    }

    // 1. Delete user_places (references places)
    const { error: upError } = await supabase
      .from('user_places')
      .delete()
      .eq('user_id', user.id);
    if (upError) throw upError;

    // 2. Delete places created by the user
    const { error: placesError } = await supabase
      .from('places')
      .delete()
      .eq('created_by', user.id);
    if (placesError) throw placesError;

    // 3. Delete documents (cascades to locations & waypoints)
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', user.id);
    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error('Error deleting all user data:', error);
    toast.error('Error al eliminar todos los datos');
    return false;
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
