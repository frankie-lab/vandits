// Domain: Geography — Helper único para renormalizar la jerarquía geográfica
// de un punto desde sus coordenadas. Llama a backfill-admin-fks en modo
// 'overwrite' restringido al locationId. UI única.
//
// Uso:
//   await renormalizeLocation(locationId);  // dispara, toast, refresh global
//
// No toca name/description/enriched_data/photos/notas/colecciones.

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export async function renormalizeLocation(locationId: string): Promise<boolean> {
  if (!locationId) return false;
  const t = toast.loading('Renormalizando geografía…');
  try {
    // El edge function backfill-admin-fks acepta scope global; para 1 punto
    // usamos directamente resolve-coordinates + UPDATE para evitar barridos.
    const { data: loc, error: locErr } = await supabase
      .from('locations')
      .select('id, latitude, longitude, owner_user_id')
      .eq('id', locationId)
      .maybeSingle();
    if (locErr || !loc) throw locErr ?? new Error('Punto no encontrado');
    if (loc.latitude == null || loc.longitude == null) throw new Error('Sin coordenadas');

    const { data, error } = await supabase.functions.invoke('resolve-coordinates', {
      body: { latitude: loc.latitude, longitude: loc.longitude },
    });
    if (error) throw error;

    const ids = (data as { ids?: Record<string, string | null> })?.ids ?? {};
    const canon = (data as { canonical?: Record<string, unknown> })?.canonical ?? null;
    const confidence = (data as { geo_confidence?: number })?.geo_confidence ?? null;

    const { error: updErr } = await supabase
      .from('locations')
      .update({
        continent_id: ids.continent_id ?? null,
        country_id: ids.country_id ?? null,
        region_id: ids.region_id ?? null,
        zone_id: ids.zone_id ?? null,
        admin3_id: ids.admin3_id ?? null,
        locality_id: ids.locality_id ?? null,
        sublocality_id: ids.sublocality_id ?? null,
        country_code: (data as { country_code?: string })?.country_code ?? null,
        postal_code: (data as { postal_code?: string })?.postal_code ?? null,
        geo_source: 'nominatim',
        geo_confidence: confidence,
        geo_resolved_at: new Date().toISOString(),
        raw_geocode: canon as never,
      })
      .eq('id', locationId);
    if (updErr) throw updErr;

    const c = (canon ?? {}) as { country?: string; region?: string; locality?: string };
    const summary = [c.locality, c.region, c.country].filter(Boolean).join(', ');
    toast.success(summary ? `Renormalizado: ${summary}` : 'Renormalizado', { id: t });
    window.dispatchEvent(new CustomEvent('reload-locations'));
    window.dispatchEvent(new CustomEvent('locations:refresh'));
    window.dispatchEvent(new CustomEvent('locations:changed'));
    return true;
  } catch (err) {
    console.error('[renormalizeLocation] failed:', err);
    toast.error(`No se pudo renormalizar: ${(err as Error).message ?? err}`, { id: t });
    return false;
  }
}
