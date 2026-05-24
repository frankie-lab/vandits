/**
 * RootStatusChipRow — Fila de pestañas Root Status (A/B/C/D) sobre el
 * universo activo del modo Discovery (Explorar / Con deuda / Sin enriquecer,
 * con o sin selección).
 *
 * Diseño visual (canon UX):
 *   - Layout: una sola línea, contenedor `flex` con `min-w-0` y SIN scroll
 *     horizontal ni vertical bajo ninguna circunstancia.
 *   - Cada estado visible es una pestaña con peso `flex-1` y `min-w-0`, así
 *     reparten el ancho disponible equitativamente y el label se trunca con
 *     ellipsis (`truncate`) si no cabe. Esto garantiza que añadir un 5º estado
 *     (o renombrar a labels más largos) NUNCA desborda.
 *   - Estado activo: fondo `slate-900` + texto blanco. Inactivo: texto
 *     `slate-600`, hover `slate-100`. El contador siempre visible a la derecha
 *     del label como badge `tabular-nums` (ancho estable independientemente
 *     del número).
 *   - Estados con count=0 se OCULTAN (salvo que estén activos en el filtro),
 *     evitando ruido visual en universos pequeños.
 *
 * Labels (SoT única):
 *   - `LETTER_LABEL`: label corto mostrado en la pestaña. Pensado para caber
 *     sin truncar en viewports ≥ 320px con 4 pestañas visibles.
 *   - `LETTER_TITLE`: descripción larga (tooltip nativo) con la semántica
 *     completa del estado.
 *   - Si se añade un nuevo estado, basta con extender el enum
 *     `RootStatusLetter`, `LETTERS`, `LETTER_LABEL` y `LETTER_TITLE`. La
 *     fila se adapta automáticamente.
 *
 * Counts: se calculan SIEMPRE sobre el `scopeLocations` recibido, usando
 * `classifyPoiRootStatusForLocation` cliente (paridad Deno garantizada por
 * `poi-identity-root-status-client-parity.test.ts`).
 *
 * Invariantes (PR-FILTER-ROOTSTATUS-2.2):
 *   - `A + B + C + D === scopeLocations.length` (partición completa).
 *   - Click sobre pestaña toggla `filters.rootStatus` (Set semántico).
 *   - El componente NO toca marker fill ni POI-N ni propaga UX más allá del
 *     filtro `rootStatus`.
 *
 * Ver `docs/audits/search-filter-root-status-filter-plan.md`.
 */
import * as React from 'react';
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
  /** Etiqueta del universo activo (informativa, ya no se renderiza). */
  scopeLabel?: string;
  /** Si hay selección activa, se propaga a `data-selection-active`. */
  selectionActive?: boolean;
  /** test-id para identificar el contexto (debt/unenriched/explore/select). */
  testId?: string;
  /** Oculta el row cuando el universo está vacío. */
  hideWhenEmpty?: boolean;
}

/** Orden canónico de las pestañas (extender aquí si aparece un 5º estado). */
const LETTERS: ReadonlyArray<RootStatusLetter> = ['A', 'B', 'C', 'D'];

/** Label corto mostrado en la pestaña. Optimizado para no truncar a ≥320px. */
const LETTER_LABEL: Record<RootStatusLetter, string> = {
  A: 'Incompleto',
  B: 'Falta canon',
  C: 'Revisar',
  D: 'Listo',
};

/** Descripción larga (tooltip nativo) con la semántica completa del estado. */
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

  // Solo mostramos estados con count > 0 (o activos en el filtro).
  const visibleLetters = LETTERS.filter(
    (l) => counts[l] > 0 || active.includes(l),
  );

  if (visibleLetters.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Estado de identidad del POI"
      className="mt-2 flex items-stretch w-full min-w-0 rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5 overflow-hidden"
      data-testid={testId ?? 'root-status-chip-row'}
      data-scope-total={total}
      data-selection-active={selectionActive ? 'true' : 'false'}
    >
      {visibleLetters.map((letter) => {
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
            // flex-1 + min-w-0 + truncate => ancho equitativo, sin desborde.
            className={cn(
              'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5',
              'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
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
                'shrink-0 inline-flex items-center justify-center',
                'min-w-[16px] h-4 px-1 rounded text-[10px] font-semibold tabular-nums',
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
  );
}
