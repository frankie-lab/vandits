/**
 * <DesignSystemThemeProvider> — montar en App.
 * Carga app_settings.design_system_overrides una vez y se subscribe a realtime
 * para re-aplicar cambios si otro admin publica.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDesignSystemEdit } from './edit-mode-store';
import type { OverrideMap } from './apply-overrides';

export function DesignSystemThemeProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useDesignSystemEdit((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'design_system_overrides')
        .maybeSingle();
      if (cancelled) return;
      const value = (data?.value ?? {}) as OverrideMap;
      hydrate(value);
    })();

    const channel = supabase
      .channel('design-system-overrides')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=eq.design_system_overrides',
        },
        (payload) => {
          const row = payload.new as { value?: OverrideMap };
          if (row?.value) hydrate(row.value);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [hydrate]);

  return <>{children}</>;
}
