/**
 * Typed global events baseline (v1.2.8)
 *
 * Helper tipado inicial para un subconjunto del bus global de `window` usado
 * por Vandits. Coexiste con el resto del catálogo no migrado descrito en
 * `docs/architecture/global-events.md` — NO sustituye al bus global; sólo
 * provee tipado y envoltorios delgados sobre `window.addEventListener` /
 * `removeEventListener` / `dispatchEvent`.
 *
 * Invariantes:
 * - No renombra eventos.
 * - No cambia payloads existentes.
 * - No cambia comportamiento runtime (los wrappers son transparentes).
 * - Eventos `void` se despachan como `new CustomEvent(name)` sin `detail`.
 * - Eventos con payload se despachan como `new CustomEvent(name, { detail })`.
 *
 * Ver `docs/tech-debt.md` ítem 2.
 */

/**
 * Tipo mínimo compatible con `IconLibrary` declarado en
 * `src/contexts/IconLibraryContext.tsx`. Se duplica inline a propósito para
 * mantener este módulo libre de dependencias React/context.
 */
export type GlobalIconLibraryName =
  | 'lucide'
  | 'fontawesome'
  | 'heroicons'
  | 'phosphor'
  | 'tabler';

export interface GlobalEventMap {
  'vandits:open-upload': void;
  'vandits:open-profile': { tab?: string };
  'admin:open-geography': void;
  'admin:open-data-sources': void;
  'pending-validations-updated': { count: number; names?: string[] };
  'enrichment-criteria-changed': void;
  'import:open-categories': void;
  'lovable:follow-changed': void;
  'popup-action': unknown;
  'duplicate-threshold-changed': { threshold: number };
  'icon-library-changed': { library: GlobalIconLibraryName };
  'personal-categories:reload': void;
}

export type GlobalEventName = keyof GlobalEventMap;

/**
 * Handler firma:
 * - eventos `void`         → `() => void`
 * - eventos con payload    → `(detail, event) => void`
 */
export type GlobalEventHandler<K extends GlobalEventName> =
  GlobalEventMap[K] extends void
    ? () => void
    : (detail: GlobalEventMap[K], event: CustomEvent<GlobalEventMap[K]>) => void;

interface RegistryEntry {
  handler: GlobalEventHandler<GlobalEventName>;
  wrapper: EventListener;
}

// Map handler → wrapper para permitir `removeGlobalEventListener(name, handler)`
// con la misma identidad de handler que se pasó al registrar.
const registry = new WeakMap<object, Map<string, RegistryEntry>>();

function getEntriesFor(handler: GlobalEventHandler<GlobalEventName>): Map<string, RegistryEntry> {
  const key = handler as unknown as object;
  let entries = registry.get(key);
  if (!entries) {
    entries = new Map();
    registry.set(key, entries);
  }
  return entries;
}

/**
 * Registra un listener tipado. Devuelve función para des-suscribirse.
 */
export function addGlobalEventListener<K extends GlobalEventName>(
  name: K,
  handler: GlobalEventHandler<K>,
): () => void {
  const wrapper: EventListener = (event) => {
    const detail = (event as CustomEvent<GlobalEventMap[K]>).detail;
    // Cast: para void handlers se ignora el argumento; para payload handlers se pasan ambos.
    (handler as (d: unknown, e: CustomEvent<unknown>) => void)(
      detail,
      event as CustomEvent<unknown>,
    );
  };
  const entries = getEntriesFor(handler as GlobalEventHandler<GlobalEventName>);
  entries.set(name, { handler: handler as GlobalEventHandler<GlobalEventName>, wrapper });
  window.addEventListener(name, wrapper);
  return () => {
    window.removeEventListener(name, wrapper);
    entries.delete(name);
  };
}

/**
 * Elimina un listener previamente registrado con `addGlobalEventListener`.
 */
export function removeGlobalEventListener<K extends GlobalEventName>(
  name: K,
  handler: GlobalEventHandler<K>,
): void {
  const entries = registry.get(handler as unknown as object);
  const entry = entries?.get(name);
  if (entry) {
    window.removeEventListener(name, entry.wrapper);
    entries!.delete(name);
  }
}

/**
 * Despacha un evento global. Para eventos `void` no se pasa `detail`.
 */
export function dispatchGlobalEvent<K extends GlobalEventName>(
  name: K,
  ...args: GlobalEventMap[K] extends void ? [] : [detail: GlobalEventMap[K]]
): void {
  if (args.length === 0) {
    window.dispatchEvent(new CustomEvent(name));
  } else {
    window.dispatchEvent(new CustomEvent(name, { detail: args[0] }));
  }
}
