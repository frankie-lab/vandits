/**
 * PoiPopupSkeleton — Placeholder para el popup del mapa mientras se enriquece.
 *
 * Composición: header (title + chip) → hero (16/9) → 3 líneas → action row.
 * Usa los mismos tokens canónicos del popup (popup.json) vía CSS vars
 * para mantener paridad visual con el popup real.
 *
 * Ver: mem://ui/skeleton-patterns · mem://style/popup/matrix-rule
 */
import { AppSkeleton } from '@/shared/components/ui/AppSkeleton';
import { HeroImageSkeleton } from './HeroImageSkeleton';

export function PoiPopupSkeleton() {
  return (
    <div
      className="flex flex-col"
      style={{ width: 'var(--popup-max-width, 360px)' }}
    >
      <div className="flex items-center justify-between gap-2 h-[var(--popup-header-height,48px)] px-[var(--popup-body-padding,16px)] border-b border-border/40">
        <AppSkeleton variant="line" width="55%" height="12px" />
        <AppSkeleton variant="line" width="48px" height="var(--control-h-sm)" className="rounded-token-sm" />
      </div>
      <HeroImageSkeleton ratio="16/9" />
      <div className="flex flex-col gap-2 p-[var(--popup-body-padding,16px)]">
        <AppSkeleton variant="line" width="100%" height="10px" />
        <AppSkeleton variant="line" width="92%" height="10px" />
        <AppSkeleton variant="line" width="76%" height="10px" />
      </div>
      <div className="flex items-center gap-2 h-[var(--popup-action-row-height,44px)] px-[var(--popup-body-padding,16px)] border-t border-border/40">
        <AppSkeleton variant="line" width="72px" height="var(--control-h-md)" className="rounded-token-md" />
        <AppSkeleton variant="line" width="72px" height="var(--control-h-md)" className="rounded-token-md" />
        <div className="flex-1" />
        <AppSkeleton variant="circle" width="var(--icon-md)" height="var(--icon-md)" />
      </div>
    </div>
  );
}
