import { describe, it, expect } from 'vitest';
import { emitDomainEvent, onDomainEvent } from '@/domains/events';

describe('Domain Event Bus', () => {
  it('subscribes and receives events', () => {
    let received = false;
    const unsub = onDomainEvent('content:reload', () => { received = true; });
    emitDomainEvent('content:reload');
    expect(received).toBe(true);
    unsub();
  });

  it('receives event data', () => {
    let locationId = '';
    const unsub = onDomainEvent('content:location-updated', (data) => {
      locationId = data.locationId;
    });
    emitDomainEvent('content:location-updated', { locationId: 'loc-123' });
    expect(locationId).toBe('loc-123');
    unsub();
  });

  it('unsubscribes correctly', () => {
    let count = 0;
    const unsub = onDomainEvent('content:reload', () => { count++; });
    emitDomainEvent('content:reload');
    unsub();
    emitDomainEvent('content:reload');
    expect(count).toBe(1);
  });
});
