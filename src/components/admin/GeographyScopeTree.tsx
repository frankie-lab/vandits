// Domain: Admin — Multi-select geography tree for the universal geography panel.
//
// Independiente del store de filtros: NO toca `filters` ni `selectedLocations`.
// Solo recolecta IDs (Set<string>) que el padre usa para mandar al job de
// backfill. Permite seleccionar libremente combinaciones a través de
// continentes/países/regiones (p.ej. Spain + France + Mexico).

import { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types/location';
import {
  HIERARCHY_LEVELS,
  LEVEL_PLACEHOLDER_LABELS,
  getFilledLocationHierarchy,
  compareGeoTreeNodes,
  type HierarchyLevel,
} from '@/shared/geography/hierarchy';

interface ScopeNode {
  level: HierarchyLevel;
  value: string;
  path: string[];
  pathKey: string;
  ids: string[]; // recursivo (incluye descendientes)
  children: ScopeNode[];
}

interface Props {
  locations: GeoLocation[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  /** Profundidad máxima del árbol (por defecto solo hasta zone para no saturar). */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 7; // continent → country → region → zone → admin3 → locality → sublocality

export function GeographyScopeTree({
  locations,
  selectedIds,
  onChange,
  maxDepth = DEFAULT_MAX_DEPTH,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const tree = useMemo(() => buildTree(locations, maxDepth), [locations, maxDepth]);

  // Auto-expand top level (continents) on first render
  useEffect(() => {
    if (tree.length === 0) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      return new Set(tree.map((n) => n.pathKey));
    });
  }, [tree]);

  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tree;
    return filterTree(tree, q);
  }, [tree, search]);

  // Auto-expand all nodes that match the search
  useEffect(() => {
    if (!search.trim()) return;
    const next = new Set<string>();
    const walk = (n: ScopeNode) => {
      next.add(n.pathKey);
      n.children.forEach(walk);
    };
    filteredTree.forEach(walk);
    setExpanded(next);
  }, [search, filteredTree]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleNode = (node: ScopeNode) => {
    const allSelected = node.ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) node.ids.forEach((id) => next.delete(id));
    else node.ids.forEach((id) => next.add(id));
    onChange(next);
  };

  const clear = () => onChange(new Set());

  const totalIds = useMemo(() => {
    const s = new Set<string>();
    tree.forEach((n) => n.ids.forEach((id) => s.add(id)));
    return s.size;
  }, [tree]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar nodos…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {search && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearch('')}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            {search ? 'Sin coincidencias.' : 'No hay POIs.'}
          </div>
        ) : (
          <ul className="py-1">
            {filteredTree.map((n) => (
              <ScopeNodeRow
                key={n.pathKey}
                node={n}
                depth={0}
                expanded={expanded}
                selectedIds={selectedIds}
                onToggleExpanded={toggleExpanded}
                onToggleNode={toggleNode}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="px-3 py-2 border-t flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <strong className="text-foreground tabular-nums">{selectedIds.size}</strong>
          {' '}/ {totalIds} seleccionados
        </span>
        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" className="h-7" onClick={clear}>
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  node: ScopeNode;
  depth: number;
  expanded: Set<string>;
  selectedIds: Set<string>;
  onToggleExpanded: (key: string) => void;
  onToggleNode: (node: ScopeNode) => void;
}

function ScopeNodeRow({
  node,
  depth,
  expanded,
  selectedIds,
  onToggleExpanded,
  onToggleNode,
}: RowProps) {
  const isOpen = expanded.has(node.pathKey);
  const hasChildren = node.children.length > 0;

  const selectedCount = node.ids.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0);
  const allSelected = selectedCount === node.ids.length && node.ids.length > 0;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <li>
      <div
        className="flex items-center gap-1.5 pr-2 py-1 hover:bg-muted/40 group"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpanded(node.pathKey)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => onToggleNode(node)}
          className="h-3.5 w-3.5"
        />
        <button
          type="button"
          onClick={() => (hasChildren ? onToggleExpanded(node.pathKey) : onToggleNode(node))}
          className={cn(
            'flex-1 min-w-0 flex items-center justify-between text-left text-xs gap-2',
            allSelected && 'font-medium',
          )}
        >
          <span className="truncate">{node.value}</span>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount}/${node.ids.length}` : node.ids.length}
          </span>
        </button>
      </div>
      {hasChildren && isOpen && (
        <ul>
          {node.children.map((c) => (
            <ScopeNodeRow
              key={c.pathKey}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              selectedIds={selectedIds}
              onToggleExpanded={onToggleExpanded}
              onToggleNode={onToggleNode}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function buildTree(locations: GeoLocation[], maxDepth: number): ScopeNode[] {
  const root = new Map<string, ScopeNode>();
  // Helper to get/create a child by path
  const ensureNode = (
    bucket: Map<string, ScopeNode>,
    level: HierarchyLevel,
    value: string,
    parentPath: string[],
  ): ScopeNode => {
    const existing = bucket.get(value);
    if (existing) return existing;
    const path = [...parentPath, value];
    const node: ScopeNode = {
      level,
      value,
      path,
      pathKey: path.join('▶'),
      ids: [],
      children: [],
    };
    bucket.set(value, node);
    return node;
  };

  const childMaps = new WeakMap<ScopeNode, Map<string, ScopeNode>>();
  childMaps.set({} as ScopeNode, new Map()); // dummy

  for (const loc of locations) {
    if (!loc.id) continue;
    const h = getFilledLocationHierarchy(loc);
    let parentMap = root;
    let parentPath: string[] = [];
    let parentNode: ScopeNode | null = null;
    for (let depth = 0; depth < Math.min(maxDepth, HIERARCHY_LEVELS.length); depth++) {
      const level = HIERARCHY_LEVELS[depth];
      const value = h[level] ?? LEVEL_PLACEHOLDER_LABELS[level];
      const node = ensureNode(parentMap, level, value, parentPath);
      node.ids.push(loc.id);
      // Prepare next level's bucket
      let nextMap = childMaps.get(node);
      if (!nextMap) {
        nextMap = new Map<string, ScopeNode>();
        childMaps.set(node, nextMap);
      }
      parentNode = node;
      parentPath = node.path;
      parentMap = nextMap;
    }
  }

  // Materialize children arrays from the per-node maps.
  const finalize = (node: ScopeNode): void => {
    const map = childMaps.get(node);
    node.children = map ? Array.from(map.values()) : [];
    node.children.sort(compareGeoTreeNodes);
    node.children.forEach(finalize);
  };
  const tops = Array.from(root.values()).sort(compareGeoTreeNodes);
  tops.forEach(finalize);
  return tops;
}



function filterTree(nodes: ScopeNode[], q: string): ScopeNode[] {
  const out: ScopeNode[] = [];
  for (const n of nodes) {
    const selfMatch = n.value.toLowerCase().includes(q);
    const filteredChildren = filterTree(n.children, q);
    if (selfMatch || filteredChildren.length > 0) {
      out.push({ ...n, children: selfMatch ? n.children : filteredChildren });
    }
  }
  return out;
}
