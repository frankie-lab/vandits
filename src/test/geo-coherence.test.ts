import { describe, it, expect } from 'vitest';
import { assertGeoCoherence } from '@/shared/enrichment/geo-coherence';

describe('Fase 6 — assertGeoCoherence', () => {
  const canonES = { country: 'España', countryCode: 'ES', region: 'Galicia' };

  it('payload coherente con país y región → ok', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Histórica iglesia situada en A Coruña, Galicia, en el norte de España.',
      tags: ['#galicia', '#iglesia'],
    });
    expect(res.ok).toBe(true);
  });

  it('descripción menciona país distinto → bloquea (country)', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Bonito mirador en France, cerca de los Alpes.',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('geo_narrative_mismatch');
    expect(res.level).toBe('country');
    expect(res.source).toBe('descripcion');
    expect(res.got).toMatch(/France/i);
  });

  it('ISO normalización: countryCode ES + narrativa "Spain" → ok', () => {
    const res = assertGeoCoherence(
      { country: 'Spain', countryCode: 'ES', region: null },
      { descripcion: 'A landmark located in Spain near the coast.' },
    );
    expect(res.ok).toBe(true);
  });

  it('región distinta del mismo país → bloquea (region)', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Edificio modernista en pleno corazón de Cataluña.',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.level).toBe('region');
    expect(res.got).toMatch(/Catalu/i);
  });

  it('"Valencia" ambiguo (ciudad/CCAA) coherente con región canónica "Comunidad Valenciana" → ok', () => {
    const res = assertGeoCoherence(
      { country: 'España', countryCode: 'ES', region: 'Comunidad Valenciana' },
      { descripcion: 'Plaza céntrica en Valencia, con vistas al río.' },
    );
    expect(res.ok).toBe(true);
  });

  it('word boundary: "India" no matchea dentro de "Indianapolis"', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Inspirada en el estilo de Indianapolis, una ciudad de Estados Unidos.',
    });
    // bloquea por Estados Unidos, no por "India"
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.got.toLowerCase()).not.toBe('india');
  });

  it('sin canonical.region → no se evalúa región, solo país', () => {
    const res = assertGeoCoherence(
      { country: 'España', countryCode: 'ES', region: null },
      { descripcion: 'Edificio en Cataluña.' },
    );
    expect(res.ok).toBe(true);
  });

  it('payload sin menciones geográficas → ok', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Una pequeña capilla de piedra del siglo XII con tejado de pizarra.',
      tags: ['#religioso', '#medieval'],
    });
    expect(res.ok).toBe(true);
  });

  it('lugar_interes menciona país distinto → bloquea (lugar_interes)', () => {
    const res = assertGeoCoherence(canonES, {
      datos_geograficos: { lugar_interes: 'Castillo de São Jorge, Lisboa, Portugal' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.source).toBe('lugar_interes');
    expect(res.level).toBe('country');
  });

  it('datos_clave string con región distinta → bloquea (datos_clave)', () => {
    const res = assertGeoCoherence(canonES, {
      datos_clave: { region: 'Andalucía', tipo: 'monumento' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.source).toBe('datos_clave');
    expect(res.level).toBe('region');
  });

  it('mención comparativa con el canónico presente → tolerancia (ok)', () => {
    const res = assertGeoCoherence(canonES, {
      descripcion: 'Similar a edificios de France, pero ubicado en España.',
    });
    expect(res.ok).toBe(true);
  });

  it('tags con región distinta → bloquea (tags)', () => {
    const res = assertGeoCoherence(canonES, {
      tags: ['#Madrid', '#monumento'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.source).toBe('tags');
    expect(res.level).toBe('region');
  });
});
