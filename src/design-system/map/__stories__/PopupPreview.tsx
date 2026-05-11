/**
 * @vandits/design-system/map/__stories__/PopupPreview
 *
 * Token-driven, non-Leaflet renderer that mirrors what the map popup outputs.
 * Used by PopupMatrix / PopupResponsive / PopupFocused stories to validate the
 * 5×3 canonical state matrix without booting Leaflet.
 *
 * Consumes:
 *  - tokens.popup.*      sizing
 *  - tokens.poi.state.*  marker palette (header tint)
 *  - tokens.poi.ring.*   health ring colors
 *  - tokens.radius / elevation / typography / color
 */
import * as React from 'react';
import { tokens } from '@/design-system/tokens';

const hsl = (triplet: string) => `hsl(${triplet})`;

export type PopupOrigin = 'my' | 'followed' | 'service';
export type PopupState =
  | 'imported'
  | 'empty'
  | 'loadingEnrichment'
  | 'enriched'
  | 'error';

const STATE_TINT: Record<PopupState, string> = {
  imported: hsl(tokens.poi.state.imported),
  empty: hsl(tokens.poi.state.empty),
  loadingEnrichment: hsl(tokens.poi.state.imported),
  enriched: hsl(tokens.poi.state.enriched),
  error: hsl(tokens.poi.ring.error),
};

const STATE_LABEL: Record<PopupState, string> = {
  imported: 'Importado',
  empty: 'Vacío',
  loadingEnrichment: 'Enriqueciendo…',
  enriched: 'Enriquecido',
  error: 'Error de enriquecimiento',
};

const ORIGIN_LABEL: Record<PopupOrigin, string> = {
  my: 'Mío',
  followed: 'Seguido',
  service: 'Servicio',
};

export interface PopupPreviewProps {
  origin: PopupOrigin;
  state: PopupState;
  /** Show as focused/selected (used by PopupFocused story). */
  focused?: boolean;
  /** Optional hero image URL. */
  heroSrc?: string;
  /** Optional width override (for PopupResponsive). */
  width?: number | string;
  /** Optional title; defaults to a stock name. */
  title?: string;
}

/**
 * Single source-of-truth popup preview for the Map Lab.
 *
 *   ┌──────────────────────────────┐
 *   │ Header (tint by state)       │
 *   ├──────────────────────────────┤
 *   │ Hero (16:9, image/skel/svg)  │
 *   ├──────────────────────────────┤
 *   │ Body (text / skeleton / CTA) │
 *   ├──────────────────────────────┤
 *   │ Action row                   │
 *   └──────────────────────────────┘
 */
export function PopupPreview({
  origin,
  state,
  focused = false,
  heroSrc,
  width,
  title,
}: PopupPreviewProps) {
  const tint = STATE_TINT[state];
  const fg = `hsl(${tokens.color.light.foreground})`;
  const mutedFg = `hsl(${tokens.color.light.mutedForeground})`;
  const bg = `hsl(${tokens.color.light.card})`;
  const border = `hsl(${tokens.color.light.border})`;

  const isLoading = state === 'loadingEnrichment';
  const isError = state === 'error';
  const isEmpty = state === 'empty';
  const isEnriched = state === 'enriched';

  return (
    <div
      data-testid={`popup-${origin}-${state}${focused ? '-focused' : ''}`}
      style={{
        width: width ?? tokens.popup.maxWidth,
        minWidth: tokens.popup.minWidth,
        maxWidth: tokens.popup.maxWidth,
        maxHeight: tokens.popup.maxHeight,
        background: bg,
        borderRadius: tokens.radius.lg,
        boxShadow: focused
          ? tokens.elevation.shadow.popup
          : tokens.elevation.shadow.md,
        outline: focused ? `2px solid ${tint}` : 'none',
        outlineOffset: focused ? '2px' : undefined,
        border: `1px solid ${border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        font: `${tokens.typography.weight.regular} ${tokens.typography.size.body}/${tokens.typography.lineHeight.body} ${tokens.typography.fontFamily.body}`,
        color: fg,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: tokens.popup.header.height,
          padding: `0 ${tokens.popup.header.padding}`,
          background: `${tint}`,
          color: `hsl(${tokens.color.light.background})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            font: `${tokens.typography.weight.semibold} ${tokens.typography.size.body}/${tokens.typography.lineHeight.body} ${tokens.typography.fontFamily.body}`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title ?? `${ORIGIN_LABEL[origin]} · POI`}
        </span>
        <span
          style={{
            font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.mono}`,
            opacity: 0.85,
          }}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {/* Hero */}
      <div
        style={{
          aspectRatio: tokens.popup.hero.ratio,
          background: `hsl(${tokens.color.light.muted})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {isLoading ? (
          <HeroSkeletonInline />
        ) : isEnriched && heroSrc ? (
          <img
            src={heroSrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PlaceholderSvg tint={tint} />
        )}
        {isError && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '2px 8px',
              borderRadius: tokens.radius.sm,
              background: `hsl(${tokens.poi.ring.error})`,
              color: `hsl(${tokens.color.light.background})`,
              font: `${tokens.typography.weight.semibold} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.body}`,
            }}
          >
            Error
          </span>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: tokens.popup.body.padding,
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.popup.body.gap,
          color: fg,
          overflow: 'auto',
        }}
      >
        {isLoading ? (
          <LoadingLines />
        ) : isError ? (
          <ErrorRecoveryBlock />
        ) : isEmpty ? (
          <EmptyCta mutedFg={mutedFg} />
        ) : isEnriched ? (
          <EnrichedBody mutedFg={mutedFg} />
        ) : (
          <ImportedBody mutedFg={mutedFg} />
        )}

        {/* Collection chips (only for enriched/imported, not loading/error) */}
        {!isLoading && !isError && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip tint={hsl(tokens.poi.collectionTintSample.violet)} label="Norte" />
            <Chip tint={hsl(tokens.poi.collectionTintSample.amber)} label="Lugares" />
          </div>
        )}
      </div>

      {/* Action row */}
      <div
        style={{
          height: tokens.popup.actionRow.height,
          padding: `0 ${tokens.popup.body.padding}`,
          display: 'flex',
          alignItems: 'center',
          gap: tokens.popup.actionRow.gap,
          borderTop: `1px solid ${border}`,
          flexShrink: 0,
          background: `hsl(${tokens.color.light.background})`,
        }}
      >
        <ActionButton label="Abrir" primary tint={tint} />
        <ActionButton label="Editar" />
        {state !== 'loadingEnrichment' && state !== 'error' && (
          <ActionButton label="Cercanos" />
        )}
      </div>
    </div>
  );
}

function HeroSkeletonInline() {
  // Temporary inline skeleton; replaced by HeroImageSkeleton from
  // @/design-system/patterns/Skeletons once PR-2 lands.
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `hsl(${tokens.color.light.muted})`,
        backgroundImage: `linear-gradient(90deg, transparent 0%, hsl(${tokens.color.light.background} / 0.4) 50%, transparent 100%)`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s linear infinite',
      }}
      aria-hidden
    />
  );
}

function PlaceholderSvg({ tint }: { tint: string }) {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="10" r="3.5" stroke={tint} strokeWidth="2" />
      <path
        d="M12 21s-7-7.2-7-12a7 7 0 1 1 14 0c0 4.8-7 12-7 12z"
        stroke={tint}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingLines() {
  return (
    <>
      <div
        style={{
          height: 10,
          width: '100%',
          background: `hsl(${tokens.color.light.muted})`,
          borderRadius: tokens.radius.sm,
        }}
      />
      <div
        style={{
          height: 10,
          width: '88%',
          background: `hsl(${tokens.color.light.muted})`,
          borderRadius: tokens.radius.sm,
        }}
      />
      <div
        style={{
          height: 10,
          width: '64%',
          background: `hsl(${tokens.color.light.muted})`,
          borderRadius: tokens.radius.sm,
        }}
      />
    </>
  );
}

function EnrichedBody({ mutedFg }: { mutedFg: string }) {
  return (
    <p style={{ margin: 0, color: mutedFg, fontSize: tokens.typography.size.body }}>
      Antigua casa de pescadores reconvertida en mirador. Conocida por sus puestas
      de sol sobre la ría y por las regatas tradicionales de verano.
    </p>
  );
}

function ImportedBody({ mutedFg }: { mutedFg: string }) {
  return (
    <p style={{ margin: 0, color: mutedFg, fontSize: tokens.typography.size.body }}>
      Punto importado desde KML. Sin descripción enriquecida.
    </p>
  );
}

function EmptyCta({ mutedFg }: { mutedFg: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, color: mutedFg }}>Sin información todavía.</p>
      <span
        style={{
          font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.body}`,
          color: `hsl(${tokens.poi.state.empty})`,
        }}
      >
        Enriquece o explora puntos cercanos
      </span>
    </div>
  );
}

function ErrorRecoveryBlock() {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: tokens.radius.md,
        background: `hsl(${tokens.poi.ring.error} / 0.08)`,
        border: `1px solid hsl(${tokens.poi.ring.error} / 0.4)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <strong
        style={{
          font: `${tokens.typography.weight.semibold} ${tokens.typography.size.body}/1.2 ${tokens.typography.fontFamily.body}`,
          color: `hsl(${tokens.poi.ring.error})`,
        }}
      >
        No se pudo enriquecer
      </strong>
      <span
        style={{
          fontSize: tokens.typography.size.caption,
          color: `hsl(${tokens.color.light.mutedForeground})`,
        }}
      >
        El nombre no coincide con las coordenadas. Mueve el punto o reintenta.
      </span>
    </div>
  );
}

function Chip({ tint, label }: { tint: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: `${tint} / 0.15`,
        backgroundColor: 'transparent',
        border: `1px solid ${tint}`,
        color: tint,
        font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.body}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: tint,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

function ActionButton({
  label,
  primary,
  tint,
}: {
  label: string;
  primary?: boolean;
  tint?: string;
}) {
  return (
    <button
      type="button"
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: tokens.radius.md,
        background: primary ? tint : 'transparent',
        color: primary
          ? `hsl(${tokens.color.light.background})`
          : `hsl(${tokens.color.light.foreground})`,
        border: primary ? 'none' : `1px solid hsl(${tokens.color.light.border})`,
        font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.body}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
