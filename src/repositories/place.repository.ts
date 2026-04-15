import { supabase } from '@/integrations/supabase/client';
import type { Place } from '@/domains/v2';

const TABLE = 'places' as const;

function toPlace(row: any): Place {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude ?? undefined,
    enrichedData: row.enriched_data ?? undefined,
    placeType: row.place_type ?? undefined,
    classification: row.classification ?? undefined,
    continent: row.continent ?? undefined,
    country: row.country ?? undefined,
    region: row.region ?? undefined,
    zone: row.zone ?? undefined,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const placeRepository = {
  async findById(id: string): Promise<Place | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toPlace(data) : null;
  },

  async findByIds(ids: string[]): Promise<Place[]> {
    if (!ids.length) return [];
    const { data, error } = await supabase.from(TABLE).select('*').in('id', ids);
    if (error) throw error;
    return (data ?? []).map(toPlace);
  },

  async findByCreator(userId: string): Promise<Place[]> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('created_by', userId);
    if (error) throw error;
    return (data ?? []).map(toPlace);
  },

  async findNearby(lat: number, lng: number, radiusDeg: number): Promise<Place[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .gte('latitude', lat - radiusDeg)
      .lte('latitude', lat + radiusDeg)
      .gte('longitude', lng - radiusDeg)
      .lte('longitude', lng + radiusDeg);
    if (error) throw error;
    return (data ?? []).map(toPlace);
  },

  async insert(place: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place> {
    const { data, error } = await supabase.from(TABLE).insert({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      altitude: place.altitude,
      enriched_data: place.enrichedData as any,
      place_type: place.placeType,
      classification: place.classification as any,
      continent: place.continent,
      country: place.country,
      region: place.region,
      zone: place.zone,
      created_by: place.createdBy,
    }).select().single();
    if (error) throw error;
    return toPlace(data);
  },

  async insertBatch(places: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Place[]> {
    if (!places.length) return [];
    const rows = places.map(p => ({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude,
      enriched_data: p.enrichedData as any,
      place_type: p.placeType,
      classification: p.classification as any,
      continent: p.continent,
      country: p.country,
      region: p.region,
      zone: p.zone,
      created_by: p.createdBy,
    }));
    const { data, error } = await supabase.from(TABLE).insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toPlace);
  },

  async update(id: string, updates: Partial<Pick<Place, 'name' | 'latitude' | 'longitude' | 'altitude' | 'enrichedData' | 'placeType' | 'classification' | 'continent' | 'country' | 'region' | 'zone'>>): Promise<Place> {
    const row: Record<string, any> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.latitude !== undefined) row.latitude = updates.latitude;
    if (updates.longitude !== undefined) row.longitude = updates.longitude;
    if (updates.altitude !== undefined) row.altitude = updates.altitude;
    if (updates.enrichedData !== undefined) row.enriched_data = updates.enrichedData;
    if (updates.placeType !== undefined) row.place_type = updates.placeType;
    if (updates.classification !== undefined) row.classification = updates.classification;
    if (updates.continent !== undefined) row.continent = updates.continent;
    if (updates.country !== undefined) row.country = updates.country;
    if (updates.region !== undefined) row.region = updates.region;
    if (updates.zone !== undefined) row.zone = updates.zone;

    const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select().single();
    if (error) throw error;
    return toPlace(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },
};
