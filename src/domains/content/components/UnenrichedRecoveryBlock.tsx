/**
 * UnenrichedRecoveryBlock — bloque único de resolución para POIs sin enriquecer.
 *
 * Diseño "2 caminos claros + preselección":
 *  - Cabecera: título del caso + frase corta.
 *  - Recomendación destacada: el mejor candidato preseleccionado con CTA primario.
 *  - Acciones secundarias colapsadas (ver alternativas, mantener, renombrar manual,
 *    contexto cercano, reintentar).
 *
 * Casos (verdict):
 *  - coordinate_mismatch  → CTA "Mover el punto aquí"
 *  - name_mismatch / llm_unverifiable / no_match → CTA "Renombrar a …"
 *  - sin parsed (aún sin enriquecer y sin error) → CTA "Enriquecer"
 *
 * Variantes:
 *  - 'card' : popup / ficha completa
 *  - 'row'  : compacta (1 línea cabecera + CTA), el resto detrás del popover
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */

import * as React from 'react';
import {
  AlertCircle,
  ChevronDown,
  Compass,
  Edit3,
  Loader2,
  MapPin,
  RefreshCw,
  Type as TypeIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import {
  isCoherenceKind,
  type CoherenceCandidate,
  type ParsedEnrichmentError,
} from '@/domains/content/lib/enrichment-error-kind';
import { triggerEnrichLocation } from '@/domains/content/lib/enrich-location';
import {
  useEnrichmentFailure,
  enrichmentFailureStore,
} from '@/domains/content/hooks/use-enrichment-failure';
import { getPointVisualState } from '@/domains/content/lib/point-visual-state';

interface Props {
  location: GeoLocation;
  variant?: 'card' | 'row';
}

type RecommendationKind = 'move' | 'rename' | 'enrich';

interface Recommendation {
  kind: RecommendationKind;
  title: string;
  hint: string;
  candidate: CoherenceCandidate | null;
  candidates: CoherenceCandidate[];
  primaryLabel: string;
  secondaryLabel: string;
}

function geoLine(c: Pick<CoherenceCandidate, 'locality' | 'region' | 'country'>): string {
  return [c.locality, c.region, c.country].filter(Boolean).join(' · ');
}

function getRecommendation(parsed: ParsedEnrichmentError | null): Recommendation {
  // Caso sin error: aún no enriquecido.
  if (!parsed) {
    return {
      kind: 'enrich',
      title: 'Aún sin enriquecer',
      hint: 'Lanza la IA para generar la ficha de este punto.',
      candidate: null,
      candidates: [],
      primaryLabel: 'Enriquecer',
      secondaryLabel: 'Contexto cercano',
    };
  }

  const candidates = parsed.candidates ?? [];
  const nameLoc = parsed.nameLocation && parsed.nameLocation.title
    ? ({
        name: parsed.nameLocation.title,
        lat: parsed.nameLocation.lat,
        lng: parsed.nameLocation.lng,
        distanceKm: parsed.nameLocation.distanceKm,
        url: parsed.nameLocation.url,
        country: parsed.nameLocation.country,
        region: parsed.nameLocation.region,
        locality: parsed.nameLocation.locality,
      } as CoherenceCandidate)
    : null;

  // Determina el modo: coords mal vs nombre mal.
  const isCoordinateMismatch = parsed.mismatchKind === 'coordinate';

  if (isCoordinateMismatch) {
    // Mismo nombre, lejos. Recomendamos mover.
    const candidate = nameLoc ?? candidates[0] ?? null;
    const allCandidates = candidate
      ? [candidate, ...candidates.filter((c) => c.name !== candidate.name)]
      : candidates;
    return {
      kind: 'move',
      title: 'Mismo nombre, coordenadas distintas',
      hint: 'El nombre coincide con un lugar lejano. Mueve el punto si es el mismo lugar.',
      candidate,
      candidates: allCandidates,
      primaryLabel: 'Mover el punto aquí',
      secondaryLabel: 'Mantener mis coordenadas',
    };
  }

  // Nombre no encaja con la zona (coherence-name, llm_unverifiable, no_match).
  const candidate = candidates[0] ?? null;
  return {
    kind: 'rename',
    title: 'El nombre no encaja con la zona',
    hint: candidate
      ? 'Estos lugares están cerca de tus coordenadas. Renombra al correcto.'
      : 'No encontramos un lugar coincidente cerca de tus coordenadas.',
    candidate,
    candidates,
    primaryLabel: candidate ? `Renombrar a "${candidate.name ?? ''}"` : 'Renombrar manualmente',
    secondaryLabel: 'Mantener nombre',
  };
}

export function UnenrichedRecoveryBlock({ location, variant = 'card' }: Props) {
  const isEnriched = getPointVisualState(location) === 'enriched';
  const { parsed, loading } = useEnrichmentFailure(location.id, !isEnriched);

  const [busy, setBusy] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');

  if (isEnriched) return null;

  const rec = getRecommendation(parsed);
  const soft = parsed ? isCoherenceKind(parsed.kind) : false;
  const tone = parsed == null
    ? 'bg-muted/40 border-border/60'
    : soft
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/60'
      : 'bg-red-50 dark:bg-red-900/20 border-red-200/60';
  const iconClass = parsed == null
    ? 'text-muted-foreground'
    : soft
      ? 'text-amber-600'
      : 'text-red-600';

  const alternatives = rec.candidates.filter((c) => c !== rec.candidate);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleRetry = async () => {
    setBusy(true);
    try {
      const result = await triggerEnrichLocation(location.id, { focusAfter: false });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenContext = () => {
    window.dispatchEvent(
      new CustomEvent('open-nearby-context', {
        detail: {
          locationId: location.id,
          location,
          reason: parsed?.kind === 'coherence' ? 'name-coordinate-mismatch' : 'manual',
          providedName: parsed?.providedName ?? location.name,
          nameLocation: parsed?.nameLocation,
          nearbyCandidates: parsed?.candidates ?? [],
        },
      }),
    );
  };

  const handleUseName = async (candidateName?: string) => {
    if (!candidateName || candidateName === location.name) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ name: candidateName, updated_at: new Date().toISOString() })
        .eq('id', location.id);
      if (error) throw error;
      const result = await triggerEnrichLocation(location.id, { focusAfter: false });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
    } catch {
      toast.error('No se pudo renombrar');
    } finally {
      setBusy(false);
    }
  };

  const handleMovePoint = async (lat?: number, lng?: number) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
        .eq('id', location.id);
      if (error) throw error;
      const result = await triggerEnrichLocation(location.id, { focusAfter: false });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
    } catch {
      toast.error('No se pudieron actualizar las coordenadas');
    } finally {
      setBusy(false);
    }
  };

  const handleIgnoreConflict = async () => {
    setBusy(true);
    try {
      const result = await triggerEnrichLocation(location.id, {
        focusAfter: false,
        skipValidation: true,
      });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    const next = renameValue.trim();
    if (!next || next === location.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ name: next, updated_at: new Date().toISOString() })
        .eq('id', location.id);
      if (error) throw error;
      setRenaming(false);
      setRenameValue('');
      const result = await triggerEnrichLocation(location.id, { focusAfter: false });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
    } catch {
      toast.error('No se pudo renombrar');
    } finally {
      setBusy(false);
    }
  };

  const startRename = () => {
    setRenameValue(rec.candidate?.name ?? location.name);
    setRenaming(true);
  };

  // CTA primario según el modo recomendado.
  const runPrimary = () => {
    if (rec.kind === 'move' && rec.candidate) {
      return handleMovePoint(rec.candidate.lat, rec.candidate.lng);
    }
    if (rec.kind === 'rename') {
      if (rec.candidate?.name) return handleUseName(rec.candidate.name);
      return startRename();
    }
    return handleRetry();
  };

  const runSecondary = () => {
    if (rec.kind === 'enrich') return handleOpenContext();
    return handleIgnoreConflict();
  };

  // ── render: variante row (compacta) ───────────────────────────────────────
  if (variant === 'row') {
    return (
      <div className={`rounded-lg border ${tone} px-2 py-1.5 flex items-center gap-2`}>
        <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate">{rec.title}</div>
          {rec.candidate && (
            <div className="text-[10px] text-muted-foreground truncate">
              {rec.candidate.name}
              {rec.candidate.distanceKm != null && ` · ${rec.candidate.distanceKm} km`}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-[11px] px-2"
          onClick={runPrimary}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : rec.primaryLabel}
        </Button>
      </div>
    );
  }

  // ── render: variante card ─────────────────────────────────────────────────
  return (
    <div className={`rounded-lg border ${tone} flex flex-col`}>
      {/* Cabecera */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight">{rec.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{rec.hint}</div>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mt-1" />}
      </div>

      {/* Recomendación */}
      {rec.candidate && !renaming && (
        <div className="mx-3 mb-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-2 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium leading-tight break-words">
                {rec.candidate.name}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {rec.candidate.distanceKm != null && (
                  <span>a {rec.candidate.distanceKm} km</span>
                )}
                {geoLine(rec.candidate) && (
                  <span>
                    {rec.candidate.distanceKm != null ? ' · ' : ''}
                    {geoLine(rec.candidate)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[11px] px-2.5 gap-1 flex-1"
              onClick={runPrimary}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : rec.kind === 'move' ? (
                <MapPin className="w-3 h-3" />
              ) : (
                <TypeIcon className="w-3 h-3" />
              )}
              <span className="truncate">{rec.primaryLabel}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] px-2"
              onClick={runSecondary}
              disabled={busy}
            >
              {rec.secondaryLabel}
            </Button>
          </div>
        </div>
      )}

      {/* Caso enrich (sin candidate): CTA primario aislado */}
      {!rec.candidate && !renaming && rec.kind === 'enrich' && (
        <div className="mx-3 mb-2 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-[11px] px-2.5 gap-1 flex-1"
            onClick={runPrimary}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {rec.primaryLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2 gap-1"
            onClick={runSecondary}
            disabled={busy}
          >
            <Compass className="w-3 h-3" />
            {rec.secondaryLabel}
          </Button>
        </div>
      )}

      {/* Caso rename sin candidato: solo "Renombrar manualmente" */}
      {!rec.candidate && !renaming && rec.kind === 'rename' && (
        <div className="mx-3 mb-2 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-[11px] px-2.5 gap-1 flex-1"
            onClick={startRename}
            disabled={busy}
          >
            <Edit3 className="w-3 h-3" />
            Renombrar manualmente
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2"
            onClick={runSecondary}
            disabled={busy}
          >
            {rec.secondaryLabel}
          </Button>
        </div>
      )}

      {/* Alternativas colapsadas */}
      {!renaming && alternatives.length > 0 && (
        <div className="mx-3 mb-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
            {expanded
              ? 'Ocultar alternativas'
              : `Ver ${alternatives.length} alternativa${alternatives.length === 1 ? '' : 's'}`}
          </button>
          {expanded && (
            <div className="mt-1.5 flex flex-col gap-1">
              {alternatives.map((c, idx) => (
                <div
                  key={`${c.name ?? 'cand'}-${idx}`}
                  className="flex items-center gap-2 rounded border border-border/50 bg-background/60 px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.distanceKm != null && <span>{c.distanceKm} km</span>}
                      {geoLine(c) && (
                        <span>
                          {c.distanceKm != null ? ' · ' : ''}
                          {geoLine(c)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() =>
                      rec.kind === 'move'
                        ? handleMovePoint(c.lat, c.lng)
                        : handleUseName(c.name)
                    }
                    disabled={busy}
                  >
                    {rec.kind === 'move' ? 'Mover aquí' : 'Usar nombre'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input de renombrado manual */}
      {renaming && (
        <div className="mx-3 mb-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setRenaming(false);
                  setRenameValue('');
                }
              }}
              className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background"
              placeholder="Nuevo nombre"
            />
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2"
              onClick={handleRename}
              disabled={busy}
            >
              OK
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setRenaming(false);
                setRenameValue('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Pie de acciones secundarias (text-link) */}
      {!renaming && (
        <div className="border-t border-border/40 px-3 py-1.5 flex items-center gap-3 text-[11px]">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={handleRetry}
            disabled={busy}
          >
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={handleOpenContext}
            disabled={busy}
          >
            <Compass className="w-3 h-3" />
            Contexto cercano
          </button>
          {rec.kind !== 'enrich' && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50 ml-auto"
              onClick={startRename}
              disabled={busy}
            >
              <Edit3 className="w-3 h-3" />
              Renombrar…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
