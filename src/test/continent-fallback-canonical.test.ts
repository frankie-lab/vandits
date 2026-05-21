import { describe, it, expect } from 'vitest';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';

describe('continent fallback canonicalization', () => {
  const base = { id: 'x', name: 'n', coordinates: { lat: 40.4168, lng: -3.7038 } } as any;

  it('Europa raw → Europe', () => {
    expect(getLocationHierarchy({ ...base, continent: 'Europa' }).continent).toBe('Europe');
  });
  it('Europe raw → Europe', () => {
    expect(getLocationHierarchy({ ...base, continent: 'Europe' }).continent).toBe('Europe');
  });
  it('continent vacío + coords EU → Europe (bbox fallback canonicalizado)', () => {
    expect(getLocationHierarchy(base).continent).toBe('Europe');
  });
  it('coords África + sin continent → Africa', () => {
    expect(getLocationHierarchy({ ...base, coordinates: { lat: 0, lng: 20 } }).continent).toBe('Africa');
  });
});
