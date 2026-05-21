/**
 * T2A-wire (§1.b) — `applyCanonToParsed` aplica excepción regional cuando el
 * caller suministra `regionIsoCode` para PT-20/PT-30.
 */
import { describe, it, expect } from 'vitest';
import { applyCanonToParsed, type CanonAwarePoint } from '@/shared/import/canon-validator';

const mk = (p: Partial<CanonAwarePoint>): CanonAwarePoint => ({ ...p });

describe('applyCanonToParsed — PT-20 / PT-30 sin provincia', () => {
  it('PT-30 + zone ⇒ descarta zone y emite canon-region-zone-forbidden', () => {
    const p = applyCanonToParsed(
      mk({ country: 'Portugal', zone: 'Distrito Inventado', regionIsoCode: 'PT-30' }),
      { emitWarnings: false },
    );
    expect(p.zone).toBeNull();
    expect(p.canonReview).toContain('canon-region-zone-forbidden');
  });

  it('PT-20 + zoneId ⇒ descarta zoneId también', () => {
    const p = applyCanonToParsed(
      mk({ country: 'Portugal', zoneId: 'uuid-xxx', regionIsoCode: 'PT-20' }),
      { emitWarnings: false },
    );
    expect(p.zoneId).toBeNull();
    expect(p.canonReview).toContain('canon-region-zone-forbidden');
  });

  it('PT continental (PT-01) ⇒ zone se preserva', () => {
    const p = applyCanonToParsed(
      mk({ country: 'Portugal', zone: 'Braga', regionIsoCode: 'PT-01' }),
      { emitWarnings: false },
    );
    expect(p.zone).toBe('Braga');
    expect(p.canonReview ?? []).not.toContain('canon-region-zone-forbidden');
  });

  it('sin regionIsoCode ⇒ no aplica regla regional (PT mantiene zone)', () => {
    const p = applyCanonToParsed(
      mk({ country: 'Portugal', zone: 'AlgoLegacy' }),
      { emitWarnings: false },
    );
    expect(p.zone).toBe('AlgoLegacy');
  });

  it('opts.regionIsoCode tiene prioridad sobre point.regionIsoCode', () => {
    const p = applyCanonToParsed(
      mk({ country: 'Portugal', zone: 'X', regionIsoCode: 'PT-01' }),
      { regionIsoCode: 'PT-20', emitWarnings: false },
    );
    expect(p.zone).toBeNull();
  });
});
