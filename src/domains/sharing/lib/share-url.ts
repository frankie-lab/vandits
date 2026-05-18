/**
 * share-url — SoT de URLs públicas Vandits (PR-SHARE-1 v1).
 *
 * Único punto donde se conoce el dominio. Prohibido hardcodear
 * `vandits.lovable.app` en cualquier otro módulo de la app (test estático
 * `share-no-hardcoded-domain.test.ts`).
 *
 * Dominio v1: `vandits.lovable.app` (deuda — slug humano + dominio
 * propio quedan para una v2).
 */

const DEFAULT_BASE = 'https://vandits.lovable.app';

export function getPublicBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const fromEnv = env?.VITE_PUBLIC_BASE_URL?.trim();
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv.replace(/\/+$/, '');
  }
  return DEFAULT_BASE;
}

function safeId(raw: string): string {
  return encodeURIComponent(String(raw ?? '').trim());
}

export function buildPoiUrl(poiId: string): string {
  return `${getPublicBaseUrl()}/p/${safeId(poiId)}`;
}

export function buildCollectionUrl(collectionId: string): string {
  return `${getPublicBaseUrl()}/c/${safeId(collectionId)}`;
}

export function buildRouteUrl(routeId: string): string {
  return `${getPublicBaseUrl()}/r/${safeId(routeId)}`;
}
