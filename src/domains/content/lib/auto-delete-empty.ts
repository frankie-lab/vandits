/**
 * Helpers transversales: auto-borrado de contenedores vacíos.
 *
 *  - autoDeleteIfEmptyCollection(collectionId): borra la colección si tras
 *    una operación de remove-item se queda con 0 ítems.
 *  - autoDeleteIfEmptyRoute(routeId): borra la ruta/itinerario si tras
 *    eliminar waypoints se queda con <2 paradas válidas (una ruta de 0/1
 *    waypoints no es navegable).
 *
 * Llamar SIEMPRE tras cualquier operación que pueda dejar el contenedor
 * vacío. Coexiste con `autoDeleteIfEmptyDocument` (mismo patrón).
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export async function autoDeleteIfEmptyCollection(collectionId: string): Promise<boolean> {
  if (!collectionId) return false;
  try {
    const { count } = await supabase
      .from('collection_items')
      .select('id', { count: 'exact', head: true })
      .eq('collection_id', collectionId);

    if ((count ?? 0) > 0) return false;

    const { error } = await supabase.from('collections').delete().eq('id', collectionId);
    if (error) { console.warn('[autoDeleteIfEmptyCollection]', error); return false; }

    toast.info('Colección vacía eliminada automáticamente.');
    window.dispatchEvent(new CustomEvent('collections-updated'));
    window.dispatchEvent(new CustomEvent('collections:changed'));
    return true;
  } catch (e) {
    console.warn('[autoDeleteIfEmptyCollection] error:', e);
    return false;
  }
}

export async function autoDeleteIfEmptyRoute(routeId: string): Promise<boolean> {
  if (!routeId) return false;
  try {
    const { count } = await supabase
      .from('route_waypoints')
      .select('id', { count: 'exact', head: true })
      .eq('route_id', routeId);

    // <2 waypoints = ruta no navegable → borrar
    if ((count ?? 0) >= 2) return false;

    // Borrar children primero (si los tuviera) para no dejar huérfanos
    await supabase.from('route_waypoints').delete().eq('route_id', routeId);
    const { error } = await supabase.from('routes').delete().eq('id', routeId);
    if (error) { console.warn('[autoDeleteIfEmptyRoute]', error); return false; }

    toast.info('Ruta sin paradas eliminada automáticamente.');
    window.dispatchEvent(new CustomEvent('routes:changed'));
    return true;
  } catch (e) {
    console.warn('[autoDeleteIfEmptyRoute] error:', e);
    return false;
  }
}
