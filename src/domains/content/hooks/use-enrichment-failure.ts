/**
 * useEnrichmentFailure — single source of truth for "why did the AI fail to
 * enrich THIS specific point?"
 *
 * Looks up the most recent `enrichment_jobs` row whose `error_ids` contains
 * the given location id, parses the structured `error_messages[locationId]`
 * with the existing `parseEnrichmentError` helper and returns it.
 *
 * Used by:
 *  - <UnenrichedRecoveryBlock> (popup hydration, ficha completa, lista de doc)
 *
 * Cache:
 *  - In-memory `enrichmentFailureStore` (Map<locationId, ParsedEnrichmentError|null>).
 *  - TTL 60s to avoid re-querying on re-renders.
 *  - Invalidated by:
 *      * `location:enriched` window event (emitted by triggerEnrichLocation)
 *      * Postgres realtime UPDATE on `public.enrichment_jobs` (single global channel)
 *  - Exposed singleton so the popup HTML builder can reuse it without React.
 *
 * See mem://logic/enrichment/per-poi-recovery-block
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  parseEnrichmentError,
  type ParsedEnrichmentError,
} from '@/domains/content/lib/enrichment-error-kind';

type Entry = {
  parsed: ParsedEnrichmentError | null;
  fetchedAt: number;
};

const TTL_MS = 60_000;

class EnrichmentFailureStore {
  private cache = new Map<string, Entry>();
  private inflight = new Map<string, Promise<ParsedEnrichmentError | null>>();
  private listeners = new Set<() => void>();
  private realtimeBound = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.bindRealtime();
    return () => this.listeners.delete(listener);
  }

  getCached(locationId: string): ParsedEnrichmentError | null | undefined {
    const e = this.cache.get(locationId);
    if (!e) return undefined;
    if (Date.now() - e.fetchedAt > TTL_MS) {
      this.cache.delete(locationId);
      return undefined;
    }
    return e.parsed;
  }

  invalidate(locationId?: string): void {
    if (locationId) this.cache.delete(locationId);
    else this.cache.clear();
    this.notify();
  }

  /**
   * Sync accessor used by the map renderer (createCustomIcon) — returns true
   * if the cache currently records a failure for this id. Never triggers a
   * fetch (the prewarm pass below is responsible for populating the cache).
   */
  hasFailureSync(locationId: string): boolean {
    const e = this.cache.get(locationId);
    if (!e) return false;
    if (Date.now() - e.fetchedAt > TTL_MS) return false;
    return e.parsed != null;
  }

  /**
   * Bulk pre-warm: pull the most recent N enrichment_jobs for the current
   * user and seed the cache from their `error_messages` maps. After this
   * call, `hasFailureSync(id)` is reliable for every id that appears in any
   * recent job. Ids that don't appear get a `null` entry (= "no failure").
   */
  async prewarmFromRecentJobs(jobLimit = 20): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('enrichment_jobs')
        .select('error_messages, error_ids, location_ids')
        .order('updated_at', { ascending: false })
        .limit(jobLimit);
      if (error || !data) return;
      const now = Date.now();
      const seen = new Set<string>();
      for (const job of data) {
        const messages = (job.error_messages ?? null) as Record<string, unknown> | null;
        const errorIds = (job.error_ids ?? []) as string[];
        const locationIds = (job.location_ids ?? []) as string[];
        // Mark every errored id as failed (most recent wins because we iterate
        // in DESC order and skip ids we've already seen).
        for (const id of errorIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          const raw = messages?.[id];
          const parsed = raw != null ? parseEnrichmentError(raw) : null;
          this.cache.set(id, { parsed, fetchedAt: now });
        }
        // For ids that participated but are NOT in error_ids, record "no
        // failure" so the sync accessor returns false without a network hit.
        for (const id of locationIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          this.cache.set(id, { parsed: null, fetchedAt: now });
        }
      }
      this.notify();
    } catch (e) {
      console.warn('[enrichmentFailureStore] prewarm failed', e);
    }
  }

  async fetch(locationId: string, force = false): Promise<ParsedEnrichmentError | null> {
    if (!force) {
      const cached = this.getCached(locationId);
      if (cached !== undefined) return cached;
      const inflight = this.inflight.get(locationId);
      if (inflight) return inflight;
    }

    const promise = this.doFetch(locationId);
    this.inflight.set(locationId, promise);
    try {
      const result = await promise;
      this.cache.set(locationId, { parsed: result, fetchedAt: Date.now() });
      this.notify();
      return result;
    } finally {
      this.inflight.delete(locationId);
    }
  }

  private async doFetch(locationId: string): Promise<ParsedEnrichmentError | null> {
    try {
      const { data, error } = await supabase
        .from('enrichment_jobs')
        .select('error_messages')
        .contains('error_ids', [locationId])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const messages = (data.error_messages ?? null) as Record<string, unknown> | null;
      if (!messages || messages[locationId] == null) return null;
      return parseEnrichmentError(messages[locationId]);
    } catch (e) {
      console.warn('[useEnrichmentFailure] lookup failed', e);
      return null;
    }
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private bindRealtime(): void {
    if (this.realtimeBound || typeof window === 'undefined') return;
    this.realtimeBound = true;

    // Invalidate when an enrichment trigger reports success in this tab.
    window.addEventListener('location:enriched', (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string; locationId?: string } | undefined;
      const id = detail?.id ?? detail?.locationId;
      if (id) this.invalidate(id);
    });

    // Realtime: any UPDATE on enrichment_jobs may add/remove ids from error_ids.
    // We can't filter by element membership server-side, so we just clear the
    // whole cache — this is cheap because entries are small and re-fetched on
    // demand. Frequency is low (job ticks).
    try {
      supabase
        .channel('enrichment-failure-store')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'enrichment_jobs' },
          () => this.invalidate(),
        )
        .subscribe();
    } catch (e) {
      console.warn('[useEnrichmentFailure] realtime bind failed', e);
    }
  }
}

export const enrichmentFailureStore = new EnrichmentFailureStore();

/**
 * React hook returning the parsed last-failure record for a location.
 * - `parsed === null` means "never failed" (or no record).
 * - `loading` is true while the first fetch is in flight.
 */
export function useEnrichmentFailure(
  locationId: string | null | undefined,
  enabled = true,
): { parsed: ParsedEnrichmentError | null; loading: boolean } {
  // Re-render whenever the store invalidates so freshly-cleared entries refetch.
  useSyncExternalStore(
    (cb) => enrichmentFailureStore.subscribe(cb),
    () => 0,
    () => 0,
  );

  const [state, setState] = useState<{ parsed: ParsedEnrichmentError | null; loading: boolean }>(() => {
    if (!locationId || !enabled) return { parsed: null, loading: false };
    const cached = enrichmentFailureStore.getCached(locationId);
    if (cached !== undefined) return { parsed: cached, loading: false };
    return { parsed: null, loading: true };
  });

  useEffect(() => {
    if (!locationId || !enabled) {
      setState({ parsed: null, loading: false });
      return;
    }
    const cached = enrichmentFailureStore.getCached(locationId);
    if (cached !== undefined) {
      setState({ parsed: cached, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    enrichmentFailureStore.fetch(locationId).then((parsed) => {
      if (cancelled) return;
      setState({ parsed, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [locationId, enabled]);

  return state;
}
