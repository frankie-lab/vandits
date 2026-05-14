/**
 * Username registry — registro central uid -> username (PR-POI-SOURCE-6 / PR-7).
 *
 * Productores (escriben):
 *   - `useAuth`              → registra al viewer cuando carga su profile.
 *   - `UsersSidebar`         → registra a todos los profiles cargados (current user,
 *                              followeds, accesibles).
 *
 * Consumidores (leen):
 *   - `getLocationOwnership` → expone `usernameLookup` en el ownership.
 *   - `buildSourceHashtagsBlock` (popups) y `<SourceHashtag />` (React) — pintan
 *     `#frankie` en lugar del prefijo de uid.
 *
 * Helper único — NO duplicar este registro en consolas concretas. Si haces una
 * vista nueva que conoce más uid->username, llama `registerUsername(uid, name)`.
 */

const registry = new Map<string, string>();

export function registerUsername(uid: string | null | undefined, username: string | null | undefined): void {
  if (!uid || !username) return;
  const trimmed = String(username).trim();
  if (!trimmed) return;
  registry.set(uid, trimmed);
}

export function registerUsernames(entries: ReadonlyArray<{ id?: string | null; username?: string | null; display_name?: string | null }>): void {
  for (const e of entries) {
    if (!e?.id) continue;
    // Preferimos username (handle estable) sobre display_name. Display name
    // se usa para UI con avatar, pero el hashtag es identidad técnica.
    registerUsername(e.id, e.username ?? e.display_name);
  }
}

export function lookupUsername(uid: string): string | null {
  return registry.get(uid) ?? null;
}

/**
 * Prefetch eager de todos los profiles visibles. Llamar una sola vez al
 * login para que los hashtags de origen (`#sandbox-agent`, etc.) muestren
 * username sin depender de que el usuario abra `UsersSidebar`.
 *
 * Idempotente: las re-llamadas son baratas (sobreescribe el mismo uid con
 * el mismo username). Tolera errores silenciosamente — el fallback al uid
 * corto en `buildOwnerHashtag` mantiene la UI funcional.
 */
let prefetchedAt: number | null = null;
export async function prefetchAllUsernames(force = false): Promise<void> {
  if (!force && prefetchedAt && Date.now() - prefetchedAt < 60_000) return;
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name');
    if (error) return;
    registerUsernames(data ?? []);
    prefetchedAt = Date.now();
  } catch {
    /* noop */
  }
}

export function clearUsernameRegistry(): void {
  registry.clear();
  prefetchedAt = null;
}
