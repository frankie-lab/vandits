/**
 * UnenrichedRecoveryBlock — bloque único de resolución para POIs sin enriquecer.
 *
 * Diseño (variant='card') con conflicto (parsed != null):
 *  - Cabecera: título del caso + frase corta.
 *  - 2 pestañas full-width: "Lugares cercanos" / "Renombrar".
 *  - Footer CTA full-width: "Editar campos y reenriquecer" (despliega form name/lat/lng).
 *
 * Sin conflicto (parsed == null): CTA simple Enriquecer + Contexto cercano.
 * variant='row': versión compacta para listas.
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */

import * as React from 'react';
import {
  AlertCircle,
  Compass,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
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
import { useLocationsStore } from '@/domains/content';

interface Props {
  location: GeoLocation;
  variant?: 'card' | 'row';
}

type Mode = 'move' | 'rename';

function geoLine(c: Pick<CoherenceCandidate, 'locality' | 'region' | 'country'>): string {
  return [c.locality, c.region, c.country].filter(Boolean).join(' · ');
}

function resolveMode(parsed: ParsedEnrichmentError): Mode {
  return parsed.mismatchKind === 'coordinate' ? 'move' : 'rename';
}

function getCandidates(parsed: ParsedEnrichmentError): CoherenceCandidate[] {
  const list: CoherenceCandidate[] = [];
  if (parsed.nameLocation?.title) {
    list.push({
      name: parsed.nameLocation.title,
      lat: parsed.nameLocation.lat,
      lng: parsed.nameLocation.lng,
      distanceKm: parsed.nameLocation.distanceKm,
      url: parsed.nameLocation.url,
      country: parsed.nameLocation.country,
      region: parsed.nameLocation.region,
      locality: parsed.nameLocation.locality,
    });
  }
  for (const c of parsed.candidates ?? []) {
    if (!list.some((x) => x.name === c.name)) list.push(c);
  }
  return list;
}

export function UnenrichedRecoveryBlock({ location, variant = 'card' }: Props) {
  const isEnriched = getPointVisualState(location) === 'enriched';
  const { parsed, loading } = useEnrichmentFailure(location.id, !isEnriched);

  const [busy, setBusy] = React.useState(false);
  const [editingAll, setEditingAll] = React.useState(false);
  const [form, setForm] = React.useState({
    name: location.name ?? '',
    lat: String(location.coordinates.lat ?? ''),
    lng: String(location.coordinates.lng ?? ''),
    description: location.description ?? '',
  });

  // Reset al cambiar de location
  React.useEffect(() => {
    setForm({
      name: location.name ?? '',
      lat: String(location.coordinates.lat ?? ''),
      lng: String(location.coordinates.lng ?? ''),
      description: location.description ?? '',
    });
    setEditingAll(false);
  }, [location.id, location.name, location.coordinates.lat, location.coordinates.lng, location.description]);

  if (isEnriched) return null;

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
      // Sync local store so triggerEnrichLocation reads the new name.
      useLocationsStore.getState().updateLocation(location.id, {
        name: candidateName,
        updatedAt: new Date(),
      });
      const result = await triggerEnrichLocation(location.id, {
        focusAfter: false,
        skipValidation: true,
      });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
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
      useLocationsStore.getState().updateLocation(location.id, {
        coordinates: { ...location.coordinates, lat, lng },
        updatedAt: new Date(),
      });
      const result = await triggerEnrichLocation(location.id, {
        focusAfter: false,
        skipValidation: true,
      });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
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

  const handleSaveAll = async () => {
    const name = form.name.trim();
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error('Nombre y coordenadas válidos son obligatorios');
      return;
    }
    setBusy(true);
    try {
      const description = form.description.trim();
      const { error } = await supabase
        .from('locations')
        .update({
          name,
          latitude: lat,
          longitude: lng,
          description: description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);
      if (error) throw error;
      useLocationsStore.getState().updateLocation(location.id, {
        name,
        description: description || undefined,
        coordinates: { ...location.coordinates, lat, lng },
        updatedAt: new Date(),
      });
      setEditingAll(false);
      const result = await triggerEnrichLocation(location.id, {
        focusAfter: false,
        skipValidation: true,
      });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
    } catch {
      toast.error('No se pudieron guardar los cambios');
    } finally {
      setBusy(false);
    }
  };

  // ── render: variante row (compacta) ───────────────────────────────────────
  if (variant === 'row') {
    const mode: Mode = parsed ? resolveMode(parsed) : 'rename';
    const tone = parsed
      ? isCoherenceKind(parsed.kind)
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/60'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200/60'
      : 'bg-muted/40 border-border/60';
    const iconClass = parsed
      ? isCoherenceKind(parsed.kind)
        ? 'text-amber-600'
        : 'text-red-600'
      : 'text-muted-foreground';
    const cands = parsed ? getCandidates(parsed) : [];
    const first = cands[0];
    const primaryLabel = !parsed
      ? 'Enriquecer'
      : mode === 'move' && first
        ? 'Mover aquí'
        : first
          ? `Usar "${first.name}"`
          : 'Renombrar…';
    const primary = !parsed
      ? handleRetry
      : mode === 'move'
        ? () => handleMovePoint(first?.lat, first?.lng)
        : first
          ? () => handleUseName(first.name)
          : handleOpenContext;
    return (
      <div className={`rounded-lg border ${tone} px-2 py-1.5 flex items-center gap-2`}>
        <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate">
            {!parsed
              ? 'Aún sin enriquecer'
              : mode === 'move'
                ? 'Mismo nombre, coords distintas'
                : 'El nombre no encaja con la zona'}
          </div>
          {first && (
            <div className="text-[10px] text-muted-foreground truncate">
              {first.name}
              {first.distanceKm != null && ` · ${first.distanceKm} km`}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-[11px] px-2"
          onClick={primary}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : primaryLabel}
        </Button>
      </div>
    );
  }

  // ── render: variante card ─────────────────────────────────────────────────

  // Sin conflicto: bloque simple Enriquecer + Contexto cercano.
  if (!parsed) {
    return (
      <div className="rounded-lg border bg-muted/40 border-border/60 flex flex-col">
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold leading-tight">Aún sin enriquecer</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Lanza la IA para generar la ficha de este punto.
            </div>
          </div>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mt-1" />}
        </div>
        <div className="mx-3 mb-2 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-[11px] px-2.5 gap-1 flex-1"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Enriquecer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2 gap-1"
            onClick={handleOpenContext}
            disabled={busy}
          >
            <Compass className="w-3 h-3" />
            Contexto cercano
          </Button>
        </div>
      </div>
    );
  }

  // Con conflicto: tabs + footer.
  const mode = resolveMode(parsed);
  const soft = isCoherenceKind(parsed.kind);
  
  const iconClass = soft ? 'text-amber-600' : 'text-red-600';
  const title =
    mode === 'move' ? 'Mismo nombre, coordenadas distintas' : 'El nombre no encaja con la zona';
  const hint =
    mode === 'move'
      ? 'El nombre coincide con un lugar lejano. Mueve el punto si es el mismo lugar.'
      : 'Estos lugares están cerca de tus coordenadas. Renombra al correcto.';
  const candidates = getCandidates(parsed);

  const accent = soft ? 'border-amber-400/60' : 'border-red-400/60';

  return (
    <div className={`flex flex-col border-t-2 ${accent}`}>
      {/* Cabecera */}
      <div className="flex items-start gap-2 pt-2 pb-1.5">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight">{title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</div>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mt-1" />}
      </div>

      {!editingAll && (
        <div className="border-t border-border/40 pt-1.5">
          <div className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
            Lugares cercanos {candidates.length > 0 && `(${candidates.length})`}
          </div>
          {candidates.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-3">
              Sin coincidencias cercanas.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {candidates.map((c, idx) => {
                const apply = () =>
                  mode === 'move'
                    ? handleMovePoint(c.lat, c.lng)
                    : handleUseName(c.name);
                return (
                  <button
                    key={`${c.name ?? 'cand'}-${idx}`}
                    type="button"
                    onClick={apply}
                    disabled={busy}
                    className="group w-full text-left flex items-start gap-2 py-1.5 hover:bg-muted/40 transition-colors disabled:opacity-50"
                    title={mode === 'move' ? 'Mover el punto aquí' : 'Usar este nombre'}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium leading-snug break-words">
                        {c.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug break-words">
                        {c.distanceKm != null && <span>a {c.distanceKm} km</span>}
                        {geoLine(c) && (
                          <span>
                            {c.distanceKm != null ? ' · ' : ''}
                            {geoLine(c)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors mt-0.5">
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : mode === 'move' ? (
                        <MapPin className="w-3.5 h-3.5" />
                      ) : (
                        <TypeIcon className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
            onClick={handleIgnoreConflict}
            disabled={busy}
          >
            <RefreshCw className="w-3 h-3" />
            Ignorar conflicto y enriquecer igual
          </button>
        </div>
      )}

      {/* Modo "Editar todos los campos" */}
      {editingAll && (
        <div className="px-3 py-2 bg-background/40 flex flex-col gap-2">
          <label className="text-[10px] text-muted-foreground">
            Nombre
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background mt-0.5"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted-foreground">
              Latitud
              <input
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background mt-0.5"
                inputMode="decimal"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Longitud
              <input
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background mt-0.5"
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[11px] px-2.5 gap-1 flex-1"
              onClick={handleSaveAll}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Guardar y reenriquecer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] px-2"
              onClick={() => setEditingAll(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Footer CTA full-width */}
      {!editingAll && (
        <div className="border-t border-border/40 p-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[11px] gap-1"
            onClick={() => setEditingAll(true)}
            disabled={busy}
          >
            <RefreshCw className="w-3 h-3" />
            Editar campos y reenriquecer
          </Button>
        </div>
      )}
    </div>
  );
}
