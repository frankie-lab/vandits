/**
 * Sharing domain (PR-SHARE-1 Fase 1 — lógica pura).
 *
 * Fase 1 entrega SOLO la base lógica/estructural:
 *   - tipos canónicos
 *   - generación de URLs (SoT dominio)
 *   - elegibilidad de share (independiente de export)
 *   - composición de payload
 *   - adaptadores de canal (puros)
 *
 * Fuera de Fase 1 (deuda explícita para fases posteriores):
 *   - `<ShareSheet>` y demás UI
 *   - cableo en popup POI / SelectionActions / CollectionFocusView / Routes
 *   - páginas públicas `/p`, `/c`, `/r` + OpenGraph
 *   - `/z` (selecciones efímeras), slugs humanos, server-side OG
 *   - QA visual y tests E2E
 */
export * from './types';
export * from './lib/share-url';
export * from './lib/share-eligibility';
export * from './lib/share-payload';
export * from './lib/channel-adapters';
