/**
 * T2A-wire (§1.b) — `collapseZoneForRegionsWithoutProvincia` data-driven:
 *   - Açores no muestra Lisboa ni "(sin provincia)" bajo PT-20.
 *   - Madeira no muestra "(sin provincia)" bajo PT-30.
 *   - PT continental conserva el nivel Distrito.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseZoneForRegionsWithoutProvincia,
  type TreeNode,
} from '@/components/filters/GeographyTree';

function leaf(name: string, level: TreeNode['level'], path: string[]): TreeNode {
  return { name, count: 1, totalCount: 1, level, children: [], path, ids: [] };
}

function node(name: string, level: TreeNode['level'], path: string[], children: TreeNode[]): TreeNode {
  return { name, count: 1, totalCount: 1, level, children, path, ids: [] };
}

describe('collapseZoneForRegionsWithoutProvincia', () => {
  it('PT-20 Açores: zone legacy "Lisboa" se colapsa, nietos suben a la región', () => {
    const tree: TreeNode[] = [
      node('Europe', 'continent', ['Europe'], [
        node('Portugal', 'country', ['Europe', 'Portugal'], [
          node('Açores', 'region', ['Europe', 'Portugal', 'Açores'], [
            node('Lisboa', 'zone', ['Europe', 'Portugal', 'Açores', 'Lisboa'], [
              leaf('Madalena', 'localidad', ['Europe', 'Portugal', 'Açores', 'Lisboa', 'Madalena']),
            ]),
          ]),
        ]),
      ]),
    ];
    const idx = new Map<string, string>([['Portugal/Açores', 'PT-20']]);
    collapseZoneForRegionsWithoutProvincia(tree, idx);
    const acores = tree[0].children[0].children[0];
    expect(acores.children.map((c) => c.name)).toEqual(['Madalena']);
    expect(acores.children[0].path).toEqual(['Europe', 'Portugal', 'Açores', 'Madalena']);
  });

  it('PT-30 Madeira: "(sin provincia)" placeholder se colapsa', () => {
    const tree: TreeNode[] = [
      node('Europe', 'continent', ['Europe'], [
        node('Portugal', 'country', ['Europe', 'Portugal'], [
          node('Madeira', 'region', ['Europe', 'Portugal', 'Madeira'], [
            node('(sin provincia)', 'zone', ['Europe', 'Portugal', 'Madeira', '(sin provincia)'], [
              leaf('Funchal', 'localidad', ['Europe', 'Portugal', 'Madeira', '(sin provincia)', 'Funchal']),
            ]),
          ]),
        ]),
      ]),
    ];
    const idx = new Map<string, string>([['Portugal/Madeira', 'PT-30']]);
    collapseZoneForRegionsWithoutProvincia(tree, idx);
    const madeira = tree[0].children[0].children[0];
    expect(madeira.children.find((c) => c.name === '(sin provincia)')).toBeUndefined();
    expect(madeira.children.map((c) => c.name)).toEqual(['Funchal']);
  });

  it('PT continental (Norte) conserva nivel Distrito', () => {
    const tree: TreeNode[] = [
      node('Europe', 'continent', ['Europe'], [
        node('Portugal', 'country', ['Europe', 'Portugal'], [
          node('Norte', 'region', ['Europe', 'Portugal', 'Norte'], [
            node('Braga', 'zone', ['Europe', 'Portugal', 'Norte', 'Braga'], [
              leaf('Braga (Sé)', 'localidad', ['Europe', 'Portugal', 'Norte', 'Braga', 'Braga (Sé)']),
            ]),
          ]),
        ]),
      ]),
    ];
    const idx = new Map<string, string>([['Portugal/Norte', 'PT-01']]);
    collapseZoneForRegionsWithoutProvincia(tree, idx);
    const norte = tree[0].children[0].children[0];
    expect(norte.children.map((c) => c.name)).toEqual(['Braga']);
    expect(norte.children[0].level).toBe('zone');
  });

  it('región sin entrada en el índice (sin regionIsoCode) ⇒ no-op', () => {
    const tree: TreeNode[] = [
      node('Europe', 'continent', ['Europe'], [
        node('Portugal', 'country', ['Europe', 'Portugal'], [
          node('Açores', 'region', ['Europe', 'Portugal', 'Açores'], [
            node('Lisboa', 'zone', ['Europe', 'Portugal', 'Açores', 'Lisboa'], []),
          ]),
        ]),
      ]),
    ];
    collapseZoneForRegionsWithoutProvincia(tree, new Map());
    expect(tree[0].children[0].children[0].children.map((c) => c.name)).toEqual(['Lisboa']);
  });
});
