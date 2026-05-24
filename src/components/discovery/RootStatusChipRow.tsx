/**
 * RootStatusChipRow — Fila compacta de chips A/B/C/D (Root Status).
 *
 * PR-FILTER-ROOTSTATUS-2.2 (opción C, "más ligero"): en lugar de una 5ª tab
 * dedicada, exponemos A/B/C/D como una fila compacta de chips sobre el árbol
 * Geo/Tipo/Tags/Legacy, disponible en TODOS los universos relevantes:
 *
 *   - Explorar (universo = catálogo completo visible).
 *   - Mantener · Con deuda  (universo = universeBase('debt')).
 *   - Mantener · Sin enriquecer (universo = universeBase('unenriched')).
 *   - Cualquiera de los anteriores con selección activa (intersecta con sel).
 *
 * Counts se calculan SIEMPRE sobre el `scopeLocations` que recibe el row,
 * usando el mismo `classifyPoiRootStatusForLocation` cliente (paridad Deno
 * garantizada por `poi-identity-root-status-client-parity.test.ts`).
 *
 * Invariantes:
 *   - `A + B + C + D === scopeLocations.length` (partición completa).
 *   - Click sobre chip toggla `filters.rootStatus` (Set semántico).
 *   - Sin selección: A/B/C/D representa el universo activo del modo.
 *   - Con selección: A/B/C/D representa universeBase ∩ selection.
 *   - El row NO toca marker fill ni POI-N ni propaga UX más allá del filtro.
 *
 * Ver `docs/audits/search-filter-root-status-filter-plan.md`.
 */
import * as React from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import type { FilterCriteria } from '@/types/location';

export type RootStatusLetter = 'A' | 'B' | 'C' | 'D';

export interface RootStatusChipRowProps {
  /** Universo sobre el que se cuentan A/B/C/D. */
  scopeLocations: ReadonlyArray<unknown>;
  /** Filtros activos (lee `rootStatus`). */
  filters: FilterCriteria;
  /** Setter de filtros (mismo contrato que en FilterBar). */
  setFilters: (next: FilterCriteria) => void;
  /** Etiqueta del universo activo (p.ej. "Explorar", "Con deuda"). */
  scopeLabel?: string;
  /** Si hay selección activa, se anuncia en el row. */
  selectionActive?: boolean;
  /** test-id para identificar el contexto (debt/unenriched/explore/select). */
  testId?: string;
  /** Oculta el row cuando el universo está vacío. */
  hideWhenEmpty?: boolean;
}

const LETTERS: ReadonlyArray<RootStatusLetter> = ['A', 'B', 'C', 'D'];

const LETTER_LABEL: Record<RootStatusLetter, string> = {
  A: 'Incompleto',
  B: 'Falta canon',
  C: 'Revisar',
  D: 'Listo',
};


const LETTER_TITLE: Record<RootStatusLetter, string> = {
  A: 'Incompleto · falta identidad básica (nombre o coordenadas)',
  B: 'Falta canon · deuda de sistema, pendiente de backfill geográfico',
  C: 'Revisar a mano · nombre/coords sospechosos, requiere intervención humana',
  D: 'Listo para auto · canon completo, elegible para reparación automática',
};

export function RootStatusChipRow({
  scopeLocations,
  filters,
  setFilters,
  scopeLabel,
  selectionActive,
  testId,
  hideWhenEmpty = true,
}: RootStatusChipRowProps) {
  const counts = React.useMemo(() => {
    const c: Record<RootStatusLetter, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const loc of scopeLocations) {
      const { rootStatus } = classifyPoiRootStatusForLocation(loc as never);
      c[rootStatus] += 1;
    }
    return c;
  }, [scopeLocations]);

  const total = scopeLocations.length;
  if (hideWhenEmpty && total === 0) return null;

  const active = filters.rootStatus ?? [];

  const toggle = (letter: RootStatusLetter) => {
    const isActive = active.includes(letter);
    const next = isActive
      ? active.filter((x) => x !== letter)
      : [...active, letter];
    const updated: FilterCriteria = { ...filters };
    if (next.length === 0) {
      delete (updated as Record<string, unknown>).rootStatus;
    } else {
      updated.rootStatus = next;
    }
    setFilters(updated);
  };

  const visibleLetters = LETTERS.filter(
    (l) => counts[l] > 0 || active.includes(l),
  );

  return (
    <div
      className="mt-2 flex items-center gap-2 min-w-0"
      data-testid={testId ?? 'root-status-chip-row'}
      data-scope-total={total}
      data-selection-active={selectionActive ? 'true' : 'false'}
    >
      {/* Scope label — inline, single line */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        title="Estado de identidad del POI — capa independiente de salud/visibilidad"
      >
        <Shield className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
          Estado
        </span>
        {(scopeLabel || selectionActive) && (
          <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
            · {scopeLabel}{selectionActive ? ' · sel' : ''}
          </span>
        )}
      </div>

      {/* Segmented tabs — single line, no wrap, clip on overflow */}
      <div
        role="tablist"
        className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 min-w-0 flex-1 overflow-hidden"
      >
        {visibleLetters.map((letter, idx) => {
          const isActive = active.includes(letter);
          const count = counts[letter];
          const label = LETTER_LABEL[letter];
          return (
            <button
              key={letter}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => toggle(letter)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors min-w-0',
                idx > 0 && 'ml-0.5',
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
              data-testid={`root-status-chip-${letter}`}
              data-root-letter={letter}
              data-active={isActive}
              title={LETTER_TITLE[letter]}
            >
              <span className="truncate">{label}</span>
              <span
                className={cn(
                  'shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded text-[10px] font-semibold tabular-nums',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );


}
