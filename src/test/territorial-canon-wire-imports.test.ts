/**
 * T2A-wire — Contract test: `applyCanonToParsed` en parsers de import.
 */
import { describe, it, expect } from 'vitest';
import { applyCanonToParsed, type CanonAwarePoint } from '@/shared/import/canon-validator';

const mk = (p: Partial<CanonAwarePoint>): CanonAwarePoint => ({ ...p });

describe('T2A-wire — applyCanonToParsed (parsers)', () => {
  it('SE: descarta zone', () => {
    const p = applyCanonToParsed(mk({ country: 'Sweden', region: 'Stockholm', zone: 'INVALID' }), { emitWarnings: false });
    expect(p.zone).toBeNull();
    expect(p.region).toBe('Stockholm');
    expect(p.canonReview).toContain('canon-zone-forbidden');
  });

  it('BR: descarta zone', () => {
    const p = applyCanonToParsed(mk({ country: 'Brazil', zone: 'SP' }), { emitWarnings: false });
    expect(p.zone).toBeNull();
  });

  it('CL: admin3 promueve a locality', () => {
    const p = applyCanonToParsed(mk({ country: 'Chile', admin3: 'Providencia' }), { emitWarnings: false });
    expect(p.admin3).toBeNull();
    expect(p.locality).toBe('Providencia');
    expect(p.canonReview).toContain('canon-admin3-promoted-to-locality');
  });

  it('PT (hasProvincia=true, admin3): preserva admin3', () => {
    const p = applyCanonToParsed(mk({ country: 'Portugal', region: 'Norte', zone: 'Braga', admin3: 'Braga' }), { emitWarnings: false });
    expect(p.zone).toBe('Braga');
    expect(p.admin3).toBe('Braga');
  });

  it('país desconocido = no-op', () => {
    const p = applyCanonToParsed(mk({ country: 'Atlantis', zone: 'Z', admin3: 'A' }), { emitWarnings: false });
    expect(p.zone).toBe('Z');
    expect(p.admin3).toBe('A');
    expect(p.canonReview).toBeUndefined();
  });

  it('idempotente: aplicar dos veces es igual que una', () => {
    const once = applyCanonToParsed(mk({ country: 'Norway', zone: 'X' }), { emitWarnings: false });
    const twice = applyCanonToParsed({ ...once }, { emitWarnings: false });
    expect(twice).toEqual(once);
  });

  it('iso2 override prevalece sobre country', () => {
    const p = applyCanonToParsed(mk({ country: 'Spain', zone: 'Madrid' }), { iso2: 'SE', emitWarnings: false });
    expect(p.zone).toBeNull();
  });
});
