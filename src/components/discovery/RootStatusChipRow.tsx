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
  C: 'Revisar a mano',
  D: 'Listo para auto',
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

  return (
    <div
      className="flex items-center gap-1.5 mt-2 flex-wrap"
      data-testid={testId ?? 'root-status-chip-row'}
      data-scope-total={total}
      data-selection-active={selectionActive ? 'true' : 'false'}
    >
      <span
        className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1"
        title="Estado de identidad del POI — capa independiente de salud/visibilidad"
      >
        <Shield className="w-3 h-3" />
        Estado
        {scopeLabel && (
          <span className="normal-case text-muted-foreground/70">· {scopeLabel}</span>
        )}
        {selectionActive && (
          <span className="normal-case text-muted-foreground/70">· sel</span>
        )}
      </span>
      {LETTERS.map((letter) => {
        const isActive = active.includes(letter);
        const count = counts[letter];
        if (count === 0 && !isActive) return null;
        const label = LETTER_LABEL[letter];
        return (
          <button
            key={letter}
            type="button"
            onClick={() => toggle(letter)}
            className={cn(
              'h-6 px-2 rounded text-[11px] font-medium border tabular-nums transition-colors inline-flex items-center gap-1',
              isActive
                ? 'bg-slate-700 text-slate-50 border-slate-700'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
            )}
            data-testid={`root-status-chip-${letter}`}
            data-root-letter={letter}
            data-active={isActive}
            title={`${LETTER_TITLE[letter]} (${count})`}
          >
            <span>{label}</span>
            <span className="opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
