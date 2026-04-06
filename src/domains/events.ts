// Domain-level typed event bus
// Replaces scattered window.dispatchEvent / addEventListener with type-safe pub/sub

type DomainEventMap = {
  // Content domain
  'content:reload': void;
  'content:criteria-changed': void;
  'content:store-updated': void;
  'content:location-updated': { locationId: string };
  'content:trash-updated': void;

  // Social domain
  'social:follow-changed': { userId: string };

  // Routes domain
  'routes:recalculate': { routeId: string };

  // Curator/Druid domain
  'curator:filter': { curatorId: string; curatorName?: string };
  'curator:mode-entered': { curatorId: string };
  'curator:mode-exited': void;
  'druid:mode-entered': { druidId: string };
  'druid:mode-exited': void;

  // Discovery domain
  'discovery:focus-location': { locationId: string };

  // Identity domain
  'identity:profile-updated': void;
};

type Listener<T> = T extends void ? () => void : (data: T) => void;

const listeners = new Map<string, Set<Function>>();

/**
 * Emit a typed domain event.
 * Also dispatches a native CustomEvent for backward compatibility with existing listeners.
 */
export function emitDomainEvent<K extends keyof DomainEventMap>(
  event: K,
  ...args: DomainEventMap[K] extends void ? [] : [DomainEventMap[K]]
): void {
  const eventListeners = listeners.get(event);
  if (eventListeners) {
    eventListeners.forEach(fn => fn(...args));
  }

  // Backward compat: also dispatch on window for legacy listeners
  const legacyMap: Partial<Record<keyof DomainEventMap, string>> = {
    'content:reload': 'reload-locations',
    'content:criteria-changed': 'enrichment-criteria-changed',
    'content:store-updated': 'store-updated',
    'content:location-updated': 'location-realtime-update',
    'content:trash-updated': 'trash-updated',
    'social:follow-changed': 'lovable:follow-changed',
  };

  const legacyName = legacyMap[event];
  if (legacyName) {
    window.dispatchEvent(new CustomEvent(legacyName, { detail: args[0] }));
  }
}

/**
 * Subscribe to a typed domain event. Returns an unsubscribe function.
 */
export function onDomainEvent<K extends keyof DomainEventMap>(
  event: K,
  listener: Listener<DomainEventMap[K]>
): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener);

  return () => {
    listeners.get(event)?.delete(listener);
  };
}

export type { DomainEventMap };
