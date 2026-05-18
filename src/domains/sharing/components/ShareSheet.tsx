/**
 * ShareSheet — Modal unificado de sharing humano/social (PR-SHARE-1 v1).
 *
 * Único entrypoint UI de share. Se monta globalmente vía `<ShareSheet />`
 * en App y se abre con `openShareSheet(target)` desde cualquier punto.
 *
 * Reglas:
 *   - Share != Export. Si el target es grupo, ofrece un link al ExportPanel
 *     pero NO exporta archivos desde aquí.
 *   - Google/Apple Maps son adaptadores secundarios (sólo `kind='poi'`).
 *   - Si el POI individual no es shareable, se oculta el bloque URL y se
 *     dejan sólo "Copiar coords" + Maps externos.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Copy,
  Share2,
  MessageCircle,
  Facebook,
  Instagram,
  MapPin,
  Map as MapIcon,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareTarget } from '../types';
import { buildSharePayload } from '../lib/share-payload';
import { isPoiShareable } from '../lib/share-eligibility';
import {
  copyLink,
  openAppleMaps,
  openGoogleMaps,
  shareFacebook,
  shareInstagram,
  shareNative,
  shareSMS,
  shareWhatsApp,
} from '../lib/channel-adapters';
import { EligibilityCounter } from './EligibilityCounter';

const OPEN_EVENT = 'lovable:share-sheet:open';

interface OpenDetail {
  target: ShareTarget;
}

/** Abre el ShareSheet global desde cualquier punto de la app. */
export function openShareSheet(target: ShareTarget): void {
  window.dispatchEvent(
    new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { target } }),
  );
}

const KIND_TITLE: Record<ShareTarget['kind'], string> = {
  poi: 'Compartir punto',
  collection: 'Compartir colección',
  route: 'Compartir ruta',
};

export function ShareSheet() {
  const [target, setTarget] = useState<ShareTarget | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      if (detail?.target) setTarget(detail.target);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const payload = useMemo(
    () => (target ? buildSharePayload(target) : null),
    [target],
  );

  const close = useCallback(() => setTarget(null), []);

  const poiShareable = useMemo(() => {
    if (!target || target.kind !== 'poi' || !target.poi) return false;
    return isPoiShareable(target.poi);
  }, [target]);

  if (!target || !payload) return null;

  const isPoi = target.kind === 'poi';
  const isGroup = !isPoi;
  const hasShareableUrl = isPoi ? poiShareable : payload.eligibleCount > 0;

  const onCopy = async () => {
    const ok = await copyLink(payload);
    toast[ok ? 'success' : 'error'](
      ok ? 'Enlace copiado' : 'No se pudo copiar el enlace',
    );
  };

  const onNative = async () => {
    const res = await shareNative(payload);
    if (res === 'copied') toast.success('Enlace copiado');
  };

  const onInstagram = async () => {
    const ok = await shareInstagram(payload);
    toast[ok ? 'success' : 'error'](
      ok ? 'Enlace copiado · pega en tu story' : 'No se pudo copiar',
    );
  };

  const openExportPanel = () => {
    window.dispatchEvent(new CustomEvent('lovable:open-export-panel'));
    close();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            {KIND_TITLE[target.kind]}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {payload.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Eligibility counter (grupo) */}
          {isGroup && (
            <EligibilityCounter
              eligible={payload.eligibleCount}
              total={payload.totalCount}
              excluded={payload.excludedCount}
            />
          )}

          {/* No shareable warning (POI individual) */}
          {isPoi && !poiShareable && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                Este punto aún no es compartible públicamente. Puedes abrir su
                ubicación en Google/Apple Maps.
              </div>
            </div>
          )}

          {/* URL preview + copy */}
          {hasShareableUrl && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={payload.url}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={onCopy}
                  className="gap-1.5 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </Button>
              </div>

              {/* Canales sociales */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNative}
                  className="gap-2 justify-start"
                >
                  <Share2 className="w-4 h-4" />
                  Compartir…
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareWhatsApp(payload)}
                  className="gap-2 justify-start"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareSMS(payload)}
                  className="gap-2 justify-start"
                >
                  <MessageCircle className="w-4 h-4" />
                  SMS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareFacebook(payload)}
                  className="gap-2 justify-start"
                >
                  <Facebook className="w-4 h-4" />
                  Facebook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onInstagram}
                  className="gap-2 justify-start col-span-2"
                >
                  <Instagram className="w-4 h-4" />
                  Instagram (copiar enlace)
                </Button>
              </div>
            </div>
          )}

          {/* Acciones secundarias (sólo POI) */}
          {isPoi && target.poi && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Abrir en mapas externos
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openGoogleMaps(target.poi!)}
                  className="gap-2 justify-start"
                >
                  <MapIcon className="w-4 h-4" />
                  Google Maps
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAppleMaps(target.poi!)}
                  className="gap-2 justify-start"
                >
                  <MapPin className="w-4 h-4" />
                  Apple Maps
                </Button>
              </div>
            </div>
          )}

          {/* Footer grupo: link a export */}
          {isGroup && (
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={openExportPanel}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                <Download className="w-3.5 h-3.5" />
                ¿Necesitas el archivo? Exportar grupo →
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
