/**
 * image-quality-classifier.test.ts — guardrail de imagen POI-7 → POI-8.
 *
 * Garantiza que el clasificador rechaza banderas/escudos/logos/SVG y acepta
 * fotografías representativas. Mirror del shared edge en
 * `supabase/functions/_shared/image-quality.ts`.
 */

import { describe, it, expect } from 'vitest';
import { classifyImageCandidate } from '@/domains/content/lib/image-quality';

describe('classifyImageCandidate — rejected (symbolic)', () => {
  it('rejects Bandera_de_* filename', () => {
    const r = classifyImageCandidate({
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Bandera_de_Agulo_%28con_escudo%29.svg/1280px-Bandera_de_Agulo_%28con_escudo%29.svg.png',
      title: 'es:Agulo',
    });
    expect(r.status).toBe('rejected');
    expect(r.kind).toBe('symbolic');
    expect(r.reason).toBe('heraldic_token_in_filename');
  });

  it('rejects Escudo_de_* filename', () => {
    const r = classifyImageCandidate({
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Escudo_de_Capileira.svg/600px-Escudo_de_Capileira.svg.png',
    });
    expect(r.status).toBe('rejected');
    expect(r.kind).toBe('symbolic');
  });

  it('rejects Coat_of_arms / Wappen / Blason', () => {
    for (const u of [
      'https://upload.wikimedia.org/wikipedia/commons/4/45/Coat_of_arms_of_Foo.svg',
      'https://upload.wikimedia.org/wikipedia/commons/4/45/Wappen_Foo.png',
      'https://upload.wikimedia.org/wikipedia/commons/4/45/Blason_Foo.png',
    ]) {
      expect(classifyImageCandidate({ url: u }).status).toBe('rejected');
    }
  });

  it('rejects pure .svg filename even without heraldic token', () => {
    const r = classifyImageCandidate({
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Generic_icon.svg',
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('svg_filename');
  });

  it('rejects when sourceField is heraldic', () => {
    const r = classifyImageCandidate({
      url: 'https://example.org/some_photo.jpg',
      sourceField: 'bandera',
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('heraldic_source_field:bandera');
  });

  it('rejects when title mentions flag/coat-of-arms', () => {
    expect(
      classifyImageCandidate({
        url: 'https://example.org/x.jpg',
        title: 'Flag of Foo',
      }).status,
    ).toBe('rejected');
  });
});

describe('classifyImageCandidate — accepted (representative)', () => {
  it('accepts a landscape photo from Wikipedia', () => {
    const r = classifyImageCandidate({
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Ainsa_m1.jpg/1280px-Ainsa_m1.jpg',
      title: 'es:Aínsa',
    });
    expect(r.status).toBe('accepted');
    expect(r.kind).toBe('representative');
    expect(r.reason).toBeNull();
  });

  it('accepts a JPG with neutral filename', () => {
    expect(
      classifyImageCandidate({ url: 'https://example.org/faro_cabo.jpg' })
        .status,
    ).toBe('accepted');
  });

  it('does not match heraldic token as substring inside other words', () => {
    // 'logos' would match because regex requires boundary; ensure 'photologue'
    // and 'belogradchik' do NOT trigger.
    expect(
      classifyImageCandidate({
        url: 'https://example.org/belogradchik_fortress.jpg',
      }).status,
    ).toBe('accepted');
  });
});

describe('classifyImageCandidate — pending_review', () => {
  it('returns pending_review for empty URL', () => {
    const r = classifyImageCandidate({ url: '' });
    expect(r.status).toBe('pending_review');
    expect(r.kind).toBe('unknown');
  });
});

describe('classifyImageCandidate — L1 false positives smoke', () => {
  // Sample of the 20 false positives recovered in L1. ALL must be rejected.
  const L1_BAD = [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Bandera_de_Agulo_%28con_escudo%29.svg/1280px-Bandera_de_Agulo_%28con_escudo%29.svg.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Bandera_de_Albarrac%C3%ADn.svg/1280px-Bandera_de_Albarrac%C3%ADn.svg.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Bandera_de_Anento.svg/1280px-Bandera_de_Anento.svg.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Bandera_de_Ba%C3%B1os_de_la_Encina_%28Ja%C3%A9n%29.svg/1280px-Bandera_de_Ba%C3%B1os_de_la_Encina_%28Ja%C3%A9n%29.svg.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Bandera_de_Capileira_%28Granada%29.svg/1280px-Bandera_de_Capileira_%28Granada%29.svg.png',
  ];
  for (const url of L1_BAD) {
    it(`rejects L1 candidate: ${url.slice(60, 110)}…`, () => {
      expect(classifyImageCandidate({ url }).status).toBe('rejected');
    });
  }
});
