import { mapPreferencesRepository } from '@/repositories/map-preferences.repository';
import type { MapMode, UserMapPreferences } from '@/domains/v2';

/**
 * Map preferences service — per-context persistence of map state.
 */
export const mapPreferencesService = {
  async load(userId: string, context: MapMode): Promise<UserMapPreferences | null> {
    return mapPreferencesRepository.findByContext(userId, context);
  },

  async save(userId: string, context: MapMode, prefs: Partial<Pick<UserMapPreferences, 'visibleLayers' | 'activeFilters' | 'viewport'>>): Promise<UserMapPreferences> {
    return mapPreferencesRepository.upsert(userId, context, prefs);
  },

  async clear(userId: string, context: MapMode): Promise<void> {
    return mapPreferencesRepository.delete(userId, context);
  },
};
