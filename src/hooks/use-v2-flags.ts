import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { V2FeatureFlags } from '@/domains/v2';
import { V2_FLAG_CONSTRAINTS } from '@/domains/v2';

const FLAG_KEYS = [
  'v2_data_read_places',
  'v2_data_read_user_places',
  'v2_data_write_imports',
  'v2_data_write_user_places',
  'v2_map_features',
  'v2_collections',
] as const;

const DEFAULT_FLAGS: V2FeatureFlags = {
  v2DataReadPlaces: false,
  v2DataReadUserPlaces: false,
  v2DataWriteImports: false,
  v2DataWriteUserPlaces: false,
  v2MapFeatures: false,
  v2Collections: false,
};

function keyToFlag(key: string): keyof V2FeatureFlags {
  // v2_data_read_places → v2DataReadPlaces
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as keyof V2FeatureFlags;
}

let cachedFlags: V2FeatureFlags | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchFlags(): Promise<V2FeatureFlags> {
  if (cachedFlags && Date.now() - cacheTime < CACHE_TTL) return cachedFlags;

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [...FLAG_KEYS]);

  if (error) {
    console.warn('[V2 Flags] Failed to fetch:', error.message);
    return cachedFlags ?? { ...DEFAULT_FLAGS };
  }

  const flags = { ...DEFAULT_FLAGS };
  for (const row of data ?? []) {
    const flagKey = keyToFlag(row.key);
    if (flagKey in flags) {
      // Value is stored as JSON string "true"/"false"
      (flags as any)[flagKey] = row.value === 'true' || row.value === true;
    }
  }

  // Validate constraints
  for (const [flag, constraint] of Object.entries(V2_FLAG_CONSTRAINTS)) {
    const flagKey = keyToFlag(flag);
    if ((flags as any)[flagKey]) {
      for (const req of constraint.requires) {
        const reqKey = keyToFlag(req);
        if (!(flags as any)[reqKey]) {
          console.warn(`[V2 Flags] ${flag} requires ${req} — disabling ${flag}`);
          (flags as any)[flagKey] = false;
        }
      }
    }
  }

  cachedFlags = flags;
  cacheTime = Date.now();
  return flags;
}

/**
 * Hook to read V2 feature flags from app_settings.
 * Caches for 1 minute. Validates prohibited combinations.
 */
export function useV2Flags(): { flags: V2FeatureFlags; loading: boolean; refresh: () => void } {
  const [flags, setFlags] = useState<V2FeatureFlags>(cachedFlags ?? DEFAULT_FLAGS);
  const [loading, setLoading] = useState(!cachedFlags);

  const refresh = useCallback(() => {
    cachedFlags = null;
    cacheTime = 0;
    setLoading(true);
    fetchFlags().then(f => {
      setFlags(f);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchFlags().then(f => {
      setFlags(f);
      setLoading(false);
    });
  }, []);

  return { flags, loading, refresh };
}

/** Non-hook version for services */
export { fetchFlags as getV2Flags };
