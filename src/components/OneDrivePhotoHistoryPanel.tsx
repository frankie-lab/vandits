/**
 * OneDrivePhotoHistoryPanel — Histórico de escaneos OneDrive.
 *
 * PR-IMPORT-UX-5. Lectura pura sobre `public.onedrive_photo_index`
 * agrupada por `folder_path`. Cada fila representa una carpeta indexada
 * con fotos geolocalizadas (mismo papel conceptual que un "documento"
 * para imports KML/GPX).
 *
 * NO incluye lógica de scan ni de creación de POIs — eso vive en
 * `OneDrivePhotosPanel` (vista acción) y en `PR-IMPORT-ONEDRIVE-CREATE-POI`
 * (backlog).
 *
 * Razón de existir: el tab Imágenes del hub de importación apuntaba a
 * `DocumentsPanel` con un filtro `source_type` inexistente (`onedrive`,
 * `photo`); como el filtro vacío caía al "sin filtro" devolvía toda la
 * biblioteca del usuario (mostraba webs de Atlas Obscura dentro de
 * "Histórico de imágenes"). Esta vista lee la fuente correcta.
 *
 * Ver: mem://logic/import/import-canon · docs/contracts/import-canon.md §8.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';

interface FolderRow {
  folder_path: string;
  photo_count: number;
  last_scan: string | null;
  last_taken: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function folderLabel(path: string): string {
  if (!path) return 'OneDrive (raíz)';
  const trimmed = path.replace(/\/+$/, '');
  const seg = trimmed.split('/').filter(Boolean).pop();
  return seg || trimmed || 'OneDrive (raíz)';
}

export function OneDrivePhotoHistoryPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FolderRow[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchScans = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Sin función de grupo en PostgREST sin RPC dedicado — agregamos
      // en cliente. Las RLS aseguran sólo filas del usuario actual.
      const { data, error } = await supabase
        .from('onedrive_photo_index')
        .select('folder_path, taken_at, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(10000);
      if (error) throw error;

      const map = new Map<string, FolderRow>();
      for (const r of data ?? []) {
        const key = r.folder_path ?? '';
        const cur = map.get(key) ?? {
          folder_path: key,
          photo_count: 0,
          last_scan: null,
          last_taken: null,
        };
        cur.photo_count += 1;
        const scanAt = (r.updated_at ?? r.created_at) as string | null;
        if (scanAt && (!cur.last_scan || scanAt > cur.last_scan)) cur.last_scan = scanAt;
        if (r.taken_at && (!cur.last_taken || r.taken_at > cur.last_taken)) cur.last_taken = r.taken_at;
        map.set(key, cur);
      }
      const list = Array.from(map.values()).sort((a, b) =>
        (b.last_scan ?? '').localeCompare(a.last_scan ?? ''),
      );
      setRows(list);
      setTotalPhotos((data ?? []).length);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void fetchScans(); }, [fetchScans]);

  return (
    <div className="flex flex-col" data-onedrive-history>
      <header className="px-[var(--panel-padding-x)] pt-2 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderOpen className="w-4 h-4 text-primary" />
            <span>Histórico de imágenes</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escaneos de OneDrive: carpetas con fotos geolocalizadas indexadas.
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              {totalPhotos} fotos con GPS
            </span>
            <span>·</span>
            <span>{rows.length} carpeta{rows.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fetchScans()}
          disabled={loading}
          aria-label="Refrescar histórico de imágenes"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
        </Button>
      </header>

      <div className="px-[var(--panel-padding-x)] pb-4">
        {loading && rows.length === 0 ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Cargando histórico…
          </div>
        ) : rows.length === 0 ? (
          <div
            className="py-10 text-center text-sm text-muted-foreground"
            data-onedrive-history-empty
          >
            <p className="font-medium text-foreground">
              No has escaneado OneDrive todavía
            </p>
            <p className="mt-1 text-xs">
              Usa "Subir imágenes" arriba para iniciar un escaneo de fotos
              con coordenadas GPS.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.folder_path || '__root__'}
                data-onedrive-folder-row
                className="rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {folderLabel(r.folder_path)}
                    </p>
                    {r.folder_path && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {r.folder_path}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-foreground tabular-nums">
                    {r.photo_count} foto{r.photo_count === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Último escaneo: {formatDate(r.last_scan)}
                  {r.last_taken && <> · Última toma: {formatDate(r.last_taken)}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
