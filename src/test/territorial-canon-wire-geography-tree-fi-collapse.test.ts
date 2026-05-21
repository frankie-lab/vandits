/**
 * T2A-wire / Bug-fix — GeographyTree NO debe renderizar nodos placeholder
 * `(sin provincia)` para países con `hasProvincia=false`. La región debe
 * sobrevivir; sólo el nivel zone (3) se omite y sus nietos suben a region.
 *
 * Repro real FI:
 *   - country_code='FI', regionResolved='Lapland', zoneResolved=null,
 *     admin3Resolved=null, localityResolved='Kemijärvi'.
 *   - getLocationHierarchy → zone=undefined; getFilledLocationHierarchy
 *     rellena zone con placeholder '(sin provincia)'.
 *   - Tree pre-collapse: Europe → Finland → Lapland → (sin provincia) → ...
 *   - Tree post-collapse: Europe → Finland → Lapland → Kemijärvi (locality).
 *
 * Bug histórico: el collapse iteraba a nivel COUNTRY (no REGION), borraba
 * las regiones y dejaba 16 nodos `(sin provincia)` directamente bajo
 * Finland en la UI.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseZoneForCountriesWithoutProvincia,
  type TreeNode,
} from '@/components/filters/GeographyTree';

function n(name: string, level: TreeNode['level'], path: string[], children: TreeNode[] = []): TreeNode {
  return { name, count: 1, totalCount: 1, level, children, path, ids: [] };
}

describe('GeographyTree — collapse FI (hasProvincia=false)', () => {
  it('FI real: Region sobrevive, zone placeholder se omite, locality sube bajo region', () => {
    // Árbol pre-collapse exactamente como lo produce el grouper para 1 POI FI.
    const tree: TreeNode[] = [
      n('Europe', 'continent', ['Europe'], [
        n('Finland', 'country', ['Europe', 'Finland'], [
          n('Lapland', 'region', ['Europe', 'Finland', 'Lapland'], [
            n('(sin provincia)', 'zone', ['Europe', 'Finland', 'Lapland', '(sin provincia)'], [
              n('(sin comarca)', 'comarca',
                ['Europe', 'Finland', 'Lapland', '(sin provincia)', '(sin comarca)'], [
                  n('Kemijärvi', 'localidad',
                    ['Europe', 'Finland', 'Lapland', '(sin provincia)', '(sin comarca)', 'Kemijärvi']),
                ]),
            ]),
          ]),
        ]),
      ]),
    ];

    collapseZoneForCountriesWithoutProvincia(tree);

    const europe = tree[0];
    const finland = europe.children[0];
    expect(finland.name).toBe('Finland');
    // La región Lapland debe seguir existiendo bajo Finland.
    expect(finland.children).toHaveLength(1);
    const lapland = finland.children[0];
    expect(lapland.name).toBe('Lapland');
    expect(lapland.level).toBe('region');
    // Bajo región ya NO hay placeholder `(sin provincia)`; sus nietos suben.
    for (const child of lapland.children) {
      expect(child.name).not.toMatch(/^\(sin provincia/i);
      expect(child.level).not.toBe('zone');
    }
    // El admin3 placeholder y la locality `Kemijärvi` siguen accesibles bajo Lapland.
    const admin3 = lapland.children[0];
    expect(admin3.level).toBe('comarca');
    // Paths reescritos sin segmento zone.
    expect(admin3.path).toEqual(['Europe', 'Finland', 'Lapland', '(sin comarca)']);
    const locality = admin3.children[0];
    expect(locality.name).toBe('Kemijärvi');
    expect(locality.path).toEqual(['Europe', 'Finland', 'Lapland', '(sin comarca)', 'Kemijärvi']);
  });

  it('FI multi-región: ninguna región se pierde y ninguna queda con placeholder zone', () => {
    const tree: TreeNode[] = [
      n('Europe', 'continent', ['Europe'], [
        n('Finland', 'country', ['Europe', 'Finland'], [
          n('Lapland', 'region', ['Europe', 'Finland', 'Lapland'], [
            n('(sin provincia)', 'zone', ['Europe', 'Finland', 'Lapland', '(sin provincia)'], [
              n('Kemijärvi', 'localidad',
                ['Europe', 'Finland', 'Lapland', '(sin provincia)', 'Kemijärvi']),
            ]),
          ]),
          n('Uusimaa', 'region', ['Europe', 'Finland', 'Uusimaa'], [
            n('(sin provincia)', 'zone', ['Europe', 'Finland', 'Uusimaa', '(sin provincia)'], [
              n('Hanko', 'localidad',
                ['Europe', 'Finland', 'Uusimaa', '(sin provincia)', 'Hanko']),
            ]),
          ]),
        ]),
      ]),
    ];

    collapseZoneForCountriesWithoutProvincia(tree);

    const finland = tree[0].children[0];
    expect(finland.children.map((c) => c.name).sort()).toEqual(['Lapland', 'Uusimaa']);
    for (const region of finland.children) {
      for (const child of region.children) {
        expect(child.name).not.toMatch(/^\(sin provincia/i);
      }
    }
  });

  it('PT (hasProvincia=true): no toca el árbol — zone real Braga sobrevive', () => {
    const tree: TreeNode[] = [
      n('Europe', 'continent', ['Europe'], [
        n('Portugal', 'country', ['Europe', 'Portugal'], [
          n('Norte', 'region', ['Europe', 'Portugal', 'Norte'], [
            n('Braga', 'zone', ['Europe', 'Portugal', 'Norte', 'Braga']),
          ]),
        ]),
      ]),
    ];

    collapseZoneForCountriesWithoutProvincia(tree);

    const norte = tree[0].children[0].children[0];
    expect(norte.children).toHaveLength(1);
    expect(norte.children[0].name).toBe('Braga');
    expect(norte.children[0].level).toBe('zone');
  });
});
