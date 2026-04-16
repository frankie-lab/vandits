// Domain-level typed event bus

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

  // Discovery domain
  'discovery:focus-location': { locationId: string };

  // Identity domain
  'identity:profile-updated': void;
};

type Listener<T> = T extends void ? () => void : (data: T) => void;

const listeners = new Map<string, Set<Function>>();

export function emitDomainEvent<K extends keyof DomainEventMap>(
  event: K,
  ...args: DomainEventMap[K] extends void ? [] : [DomainEventMap[K]]
): void {
  const eventListeners = listeners.get(event);
  if (eventListeners) {
    eventListeners.forEach(fn => fn(...args));
  }

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
