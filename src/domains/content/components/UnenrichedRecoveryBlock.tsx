/**
 * UnenrichedRecoveryBlock — single component shown inside the ficha of any
 * non-enriched POI (popup, ficha completa, document waypoint row).
 *
 * Mirrors the resolution UI from BatchEnrichmentPanel.ErrorsResolutionList,
 * scoped to one location, hydrated from the most recent enrichment_jobs row
 * via `useEnrichmentFailure`.
 *
 * Variants:
 *  - 'card' : full-width block (used in GalleryView / ficha completa)
 *  - 'row'  : compact one-line block (used in DocumentWaypointsTabs rows)
 *
 * See mem://logic/enrichment/per-poi-recovery-block
 */

import * as React from 'react';
import { AlertCircle, Compass, Edit3, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import {
  isCoherenceKind,
  labelForKind,
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

export function UnenrichedRecoveryBlock({ location, variant = 'card' }: Props) {
  const isEnriched = getPointVisualState(location) === 'enriched';
  const { parsed, loading } = useEnrichmentFailure(location.id, !isEnriched);

  const [busy, setBusy] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');

  if (isEnriched) return null;

  const soft = parsed ? isCoherenceKind(parsed.kind) : false;
  const candidates = parsed?.candidates ?? [];
  const mismatchKind = parsed?.mismatchKind;
  const isCoordinateMismatch = parsed?.kind === 'coherence' && mismatchKind === 'coordinate';
  // Recommended row = textual candidate from nameLocation when present; else first nearby.
  const recommendedFromName = parsed?.nameLocation && parsed.nameLocation.title
    ? {
        name: parsed.nameLocation.title,
        lat: parsed.nameLocation.lat,
        lng: parsed.nameLocation.lng,
        distanceKm: parsed.nameLocation.distanceKm,
        url: parsed.nameLocation.url,
        country: parsed.nameLocation.country,
        region: parsed.nameLocation.region,
        locality: parsed.nameLocation.locality,
      }
    : null;
  const allCandidates = [
    ...(recommendedFromName ? [recommendedFromName] : []),
    ...candidates.filter((c) => !recommendedFromName || c.name !== recommendedFromName.name),
  ].slice(0, 5);

  const tone =
    parsed == null
      ? 'bg-muted/40 border-border/60'
      : soft
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/50'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200/50';
  const iconClass =
    parsed == null ? 'text-muted-foreground' : soft ? 'text-amber-600' : 'text-red-600';
  const badgeClass =
    parsed == null
      ? 'border-border text-muted-foreground'
      : soft
        ? 'border-amber-400 text-amber-700'
        : 'border-red-400 text-red-700';

  const message = parsed?.message ?? 'Este punto aún no se ha enriquecido.';
  const distanceKm = parsed?.nameLocation?.distanceKm;
  const showRenameButton =
    (parsed?.kind === 'coherence' || parsed?.kind === 'llm_unverifiable') &&
    candidates.length > 0;

  const handleRetry = async () => {
    setBusy(true);
    try {
      const result = await triggerEnrichLocation(location.id, { focusAfter: false });
      if (result.success) {
        enrichmentFailureStore.invalidate(location.id);
      } else if (result.error) {
        toast.error(result.error);
      }
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
          nearbyCandidates: candidates,
        },
      }),
    );
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
      if (result.success) {
        enrichmentFailureStore.invalidate(location.id);
      }
    } catch (e) {
      toast.error('No se pudo renombrar');
    } finally {
      setBusy(false);
    }
  };

  const startRename = () => {
    setRenameValue(candidates[0]?.name ?? location.name);
    setRenaming(true);
  };

  // Three per-candidate actions used by the inline list when there is a coherence conflict.
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
      const result = await triggerEnrichLocation(location.id, { focusAfter: false, skipValidation: true });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
    } finally {
      setBusy(false);
    }
  };

  const compact = variant === 'row';
  const padding = compact ? 'p-2' : 'p-3';
  const titleSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className={`rounded-lg border ${tone} ${padding} flex flex-col gap-2`}>
      <div className="flex items-start gap-2">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${badgeClass}`}>
              {parsed ? labelForKind(parsed.kind) : 'Sin enriquecer'}
            </Badge>
            {distanceKm != null && (
              <span className="text-[10px] text-muted-foreground">{distanceKm} km</span>
            )}
            {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          {!compact && (
            <p className={`${titleSize} text-muted-foreground mt-1 line-clamp-2`}>{message}</p>
          )}
        </div>
      </div>

      {!renaming && allCandidates.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-amber-200/40 dark:border-amber-800/40 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {isCoordinateMismatch
              ? 'Misma identidad, coordenadas distintas'
              : 'Candidatos cercanos'}
          </div>
          {allCandidates.map((c, idx) => {
            const geo = [c.locality, c.region, c.country].filter(Boolean).join(' · ');
            return (
              <div
                key={`${c.name}-${idx}`}
                className="flex items-center gap-1.5 flex-wrap rounded border border-border/60 bg-background/60 px-1.5 py-1"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {c.distanceKm != null && <span>{c.distanceKm} km</span>}
                    {geo && <span>{c.distanceKm != null ? ' · ' : ''}{geo}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => handleUseName(c.name)}
                  disabled={busy || !c.name || c.name === location.name}
                  title="Usar este nombre para el punto"
                >
                  Usar nombre
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => handleMovePoint(c.lat, c.lng)}
                  disabled={busy || typeof c.lat !== 'number' || typeof c.lng !== 'number'}
                  title="Mover el punto a estas coordenadas"
                >
                  Mover aquí
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] self-start text-muted-foreground"
            onClick={handleIgnoreConflict}
            disabled={busy}
          >
            Ignorar conflicto y enriquecer igual
          </Button>
        </div>
      )}

      {renaming ? (
        <div className="flex flex-col gap-1.5">
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
          {candidates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidates.slice(0, 4).map((c, idx) => (
                <button
                  key={`${c.name}-${idx}`}
                  type="button"
                  onClick={() => setRenameValue(c.name ?? '')}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  {c.name}
                  {c.distanceKm != null && (
                    <span className="ml-1 text-muted-foreground">{c.distanceKm}km</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Reintentar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1 text-amber-700 dark:text-amber-400"
            onClick={handleOpenContext}
            disabled={busy}
          >
            <Compass className="w-3 h-3" />
            Contexto cercano
          </Button>
          {showRenameButton && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1"
              onClick={startRename}
              disabled={busy}
            >
              <Edit3 className="w-3 h-3" />
              Renombrar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
