import { supabase } from '@/integrations/supabase/client';
import type { UserMapPreferences, MapMode } from '@/domains/v2';

const TABLE = 'user_map_preferences' as const;

function toPrefs(row: any): UserMapPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    context: row.context,
    visibleLayers: row.visible_layers ?? {},
    activeFilters: row.active_filters ?? {},
    viewport: row.viewport ?? {},
    updatedAt: new Date(row.updated_at),
  };
}

export const mapPreferencesRepository = {
  async findByContext(userId: string, context: MapMode): Promise<UserMapPreferences | null> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('user_id', userId).eq('context', context).maybeSingle();
    if (error) throw error;
    return data ? toPrefs(data) : null;
  },

  async upsert(userId: string, context: MapMode, prefs: Partial<Pick<UserMapPreferences, 'visibleLayers' | 'activeFilters' | 'viewport'>>): Promise<UserMapPreferences> {
    const { data, error } = await supabase.from(TABLE).upsert({
      user_id: userId,
      context,
      visible_layers: prefs.visibleLayers ?? {},
      active_filters: prefs.activeFilters ?? {},
      viewport: prefs.viewport ?? {},
    }, { onConflict: 'user_id,context' }).select().single();
    if (error) throw error;
    return toPrefs(data);
  },

  async delete(userId: string, context: MapMode): Promise<void> {
    const { error } = await supabase.from(TABLE).delete()
      .eq('user_id', userId).eq('context', context);
    if (error) throw error;
  },
};
