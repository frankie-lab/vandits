/**
 * UnenrichedRecoveryBlock — bloque único de resolución para POIs sin enriquecer.
 *
 * Diseño (variant='card') con conflicto (parsed != null):
 *  - Cabecera: título genérico + frase corta.
 *  - Lista única de "opciones posibles": cada candidato es nombre+coords+jerarquía.
 *    Al pulsar una fila se adopta la identidad completa (nombre + lat/lng) y se
 *    enriquece automáticamente.
 *  - Buscador al pie: el usuario puede teclear otro nombre y la lista se sustituye
 *    por los resultados de Wikipedia (con coordenadas). Si no hay resultados,
 *    aparece "Usar este nombre tal cual" como salida.
 *  - Footer CTA "Editar" para abrir form name/lat/lng/notas.
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
  RefreshCw,
  Search,
  Sparkles,
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
import { searchWikiCandidates } from '@/domains/content/lib/wiki-name-search';

interface Props {
  location: GeoLocation;
  variant?: 'card' | 'row';
}

function geoLine(c: Pick<CoherenceCandidate, 'locality' | 'region' | 'country'>): string {
  return [c.locality, c.region, c.country].filter(Boolean).join(' · ');
}

function getInitialCandidates(parsed: ParsedEnrichmentError): CoherenceCandidate[] {
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

  // Búsqueda manual: cuando el usuario teclea un nombre, los resultados sustituyen
  // la lista de candidatos del coherence check.
  const [searchTerm, setSearchTerm] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<CoherenceCandidate[] | null>(null);

  React.useEffect(() => {
    setForm({
      name: location.name ?? '',
      lat: String(location.coordinates.lat ?? ''),
      lng: String(location.coordinates.lng ?? ''),
      description: location.description ?? '',
    });
    setEditingAll(false);
    setSearchTerm('');
    setSearchResults(null);
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

  /**
   * Acción unificada: el usuario elige un candidato como "este es el lugar correcto".
   * Adopta nombre + coordenadas atómicamente y relanza el enriquecimiento.
   */
  const handleAdoptCandidate = async (c: CoherenceCandidate) => {
    const name = (c.name ?? '').trim();
    if (!name || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
      toast.error('Candidato sin datos suficientes');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({
          name,
          latitude: c.lat,
          longitude: c.lng,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);
      if (error) throw error;
      useLocationsStore.getState().updateLocation(location.id, {
        name,
        coordinates: { ...location.coordinates, lat: c.lat, lng: c.lng },
        updatedAt: new Date(),
      });
      const result = await triggerEnrichLocation(location.id, {
        focusAfter: false,
        skipValidation: true,
      });
      if (result.success) enrichmentFailureStore.invalidate(location.id);
      else if (result.error) toast.error(result.error);
    } catch {
      toast.error('No se pudo aplicar la opción');
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

  /** Renombra al texto literal escrito (sin mover coords) + enriquece. */
  const handleUseLiteralName = async () => {
    const name = searchTerm.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', location.id);
      if (error) throw error;
      useLocationsStore.getState().updateLocation(location.id, {
        name,
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

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    try {
      const results = await searchWikiCandidates(
        term,
        { lat: location.coordinates.lat, lng: location.coordinates.lng },
        8,
      );
      setSearchResults(results);
    } finally {
      setSearching(false);
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
    const cands = parsed ? getInitialCandidates(parsed) : [];
    const first = cands[0];
    const primaryLabel = !parsed ? 'Enriquecer' : first ? 'Enriquecer aquí' : 'Resolver…';
    const primary = !parsed
      ? handleRetry
      : first
        ? () => handleAdoptCandidate(first)
        : handleOpenContext;
    return (
      <div className={`rounded-lg border ${tone} px-2 py-1.5 flex items-center gap-2`}>
        <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate">
            {!parsed ? 'Aún sin enriquecer' : 'No encaja con la zona'}
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

  // Con conflicto: lista unificada + buscador.
  const soft = isCoherenceKind(parsed.kind);
  const iconClass = soft ? 'text-amber-600' : 'text-red-600';
  const accent = soft ? 'border-amber-400/60' : 'border-red-400/60';

  const initialCandidates = getInitialCandidates(parsed);
  const candidates: CoherenceCandidate[] =
    searchResults !== null ? searchResults : initialCandidates;
  const showingSearch = searchResults !== null;
  const emptySearch = showingSearch && candidates.length === 0;

  return (
    <div className={`flex flex-col border-t-2 ${accent}`}>
      {/* Cabecera */}
      <div className="flex items-start gap-2 pt-2 pb-1.5">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight">No encaja con la zona</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Elige el lugar correcto o busca otro.
          </div>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mt-1" />}
      </div>

      {!editingAll && (
        <div className="border-t border-border/40 pt-1.5">
          <div className="px-1 pb-1 flex items-center justify-between">
            <div className="text-[11px] font-medium text-muted-foreground">
              {showingSearch ? 'Resultados' : 'Opciones posibles'}
              {candidates.length > 0 && ` (${candidates.length})`}
            </div>
            {showingSearch && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => {
                  setSearchResults(null);
                  setSearchTerm('');
                }}
                disabled={busy || searching}
              >
                Volver a sugerencias
              </button>
            )}
          </div>

          {candidates.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-3">
              {emptySearch
                ? `Sin resultados para "${searchTerm.trim()}".`
                : 'Sin coincidencias cercanas.'}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {candidates.map((c, idx) => (
                <button
                  key={`${c.name ?? 'cand'}-${idx}`}
                  type="button"
                  onClick={() => handleAdoptCandidate(c)}
                  disabled={busy || searching}
                  className="group w-full text-left flex items-start gap-2 py-1.5 px-1 hover:bg-muted/40 transition-colors disabled:opacity-50 rounded"
                  title="Usar este lugar y enriquecer"
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
                  {busy && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Buscador inferior */}
          <div className="mt-2 pt-2 border-t border-border/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative flex-1">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar otro nombre…"
                  disabled={busy || searching}
                  className="w-full text-[11px] pl-6 pr-2 py-1.5 rounded border border-border bg-background"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] px-2"
                disabled={busy || searching || !searchTerm.trim()}
              >
                {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Buscar'}
              </Button>
            </form>

            {emptySearch && (
              <Button
                size="sm"
                variant="default"
                className="w-full h-7 text-[11px] mt-2 gap-1"
                onClick={handleUseLiteralName}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Usar "{searchTerm.trim()}" tal cual
              </Button>
            )}
          </div>

          <button
            type="button"
            className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
            onClick={handleIgnoreConflict}
            disabled={busy || searching}
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
          <label className="text-[10px] text-muted-foreground">
            Notas
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background mt-0.5 resize-y"
              placeholder="Notas o descripción manual"
            />
          </label>
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
            disabled={busy || searching}
          >
            <RefreshCw className="w-3 h-3" />
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}
