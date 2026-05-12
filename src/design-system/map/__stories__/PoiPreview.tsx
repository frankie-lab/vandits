/**
 * @vandits/design-system/map/__stories__/PoiPreview
 *
 * Storybook-only renderer that mirrors what `createCustomIcon` produces, but
 * as a pure SVG/HTML component. Reads exclusively from design tokens (HSL
 * triplets wrapped via `hsl(...)`) so any drift in tokens is visible in the
 * Map Lab without booting Leaflet.
 *
 * Used by every Map Lab story. Do not import from product code.
 */
import * as React from 'react';
import { tokens } from '@/design-system/tokens';
import type {
  PoiOrigin,
  PoiRenderMode,
  PoiVisualState,
  PoiHealthState,
} from '@/design-system/map/types';
import {
  COHERENCE_GLYPH_PATH_COORDINATE,
  COHERENCE_GLYPH_PATH_NAME,
  type CoherenceGlyph,
} from '@/domains/content/lib/point-health-rings';

// All color tokens are HSL triplets ("H S% L%"). Wrap once here.
const hsl = (triplet: string) => `hsl(${triplet})`;

const STATE_COLOR: Record<PoiVisualState, string> = {
  enriched: hsl(tokens.poi.state.enriched),
  imported: hsl(tokens.poi.state.imported),
  empty: hsl(tokens.poi.state.empty),
};

const HEALTH_COLOR: Record<PoiHealthState, string> = {
  partial:   hsl(tokens.poi.health.partial),
  chain:     hsl(tokens.poi.health.chain),
  review:    hsl(tokens.poi.health.review),
  hardError: hsl(tokens.poi.health.hardError),
};

const RENDER_SCALE: Record<PoiRenderMode, number> = {
  micro: tokens.poi.renderScale.micro,
  compact: tokens.poi.renderScale.compact,
  standard: tokens.poi.renderScale.standard,
  rich: tokens.poi.renderScale.rich,
};

const ORIGIN_BORDER: Record<PoiOrigin, string> = {
  my: hsl(tokens.poi.originBorder.my),
  followed: hsl(tokens.poi.originBorder.followed),
  service: hsl(tokens.poi.originBorder.service),
  catalog: hsl(tokens.poi.originBorder.catalog),
};

/** Re-exported for stories that paint sample collection tints. */
export const COLLECTION_TINT_SAMPLE = {
  violet: hsl(tokens.poi.collectionTintSample.violet),
  sky: hsl(tokens.poi.collectionTintSample.sky),
  pink: hsl(tokens.poi.collectionTintSample.pink),
  emerald: hsl(tokens.poi.collectionTintSample.emerald),
  amber: hsl(tokens.poi.collectionTintSample.amber),
} as const;

const RING_W = parseInt(tokens.poi.ring.width, 10);
const HERO_PX = parseInt(tokens.poi.hero.size, 10);
const THUMB_PX = parseInt(tokens.poi.hero.thumbSize, 10);
const DOT_PX = parseInt(tokens.poi.microDot.size, 10);

export interface PoiPreviewProps {
  origin?: PoiOrigin;
  state?: PoiVisualState;
  health?: PoiHealthState[];
  renderMode?: PoiRenderMode;
  focused?: boolean;
  /** Optional hero image (rich mode only). */
  heroSrc?: string;
  /** Optional collection tint (inner ring, 2px gap to marker). HSL string or `hsl(...)` */
  collectionTint?: string | null;
  /** Coherence glyph overlay — only painted in `rich` renderMode. */
  glyph?: CoherenceGlyph | null;
  /** Label shown under the marker (for stories only). */
  label?: string;
}

/**
 * Single source-of-truth marker preview for the Map Lab.
 * Stacking order (outer → inner):
 *   1. Health rings (red→amber→orange), each 5px, concentric
 *   2. Collection tint ring (gap)
 *   3. Origin border ring
 *   4. State fill (or hero image in rich mode)
 */
export function PoiPreview({
  origin = 'my',
  state = 'enriched',
  health = [],
  renderMode = 'standard',
  focused = false,
  heroSrc,
  collectionTint = null,
  glyph = null,
  label,
}: PoiPreviewProps) {
  const scale = RENDER_SCALE[renderMode];
  const isMicro = renderMode === 'micro';
  const isRich = renderMode === 'rich';

  const baseDiameter = isMicro ? DOT_PX : isRich ? HERO_PX : 28;
  const diameter = isMicro ? DOT_PX : Math.round(baseDiameter * scale);

  // Health rings only render in standard/rich (canon: createCustomIcon
  // skipHealthRings on micro/compact). Stories must reflect that.
  const ringsAllowed = renderMode === 'standard' || renderMode === 'rich';
  const orderedHealth: PoiHealthState[] = ringsAllowed
    ? (['hardError', 'review', 'chain', 'partial'] as const).filter((h) => health.includes(h))
    : [];

  const ringPad = orderedHealth.length * RING_W + (collectionTint ? RING_W + 2 : 0);
  const totalDiameter = diameter + ringPad * 2 + (focused ? 4 : 0);

  // Miniatura focused/selected ELIMINADA — la regla canónica por zoom
  // (mem://style/map/zoom-driven-hero) usa solo el hero marker en `rich`
  // y el rollover Polaroid para mostrar la imagen Hero.
  const showThumb = false;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          position: 'relative',
          width: totalDiameter,
          height: totalDiameter,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: focused ? `drop-shadow(${tokens.elevation.shadow.marker})` : undefined,
        }}
        data-testid={`poi-${origin}-${state}-${renderMode}`}
      >
        {orderedHealth.map((h, i) => {
          const ringDiameter = totalDiameter - i * RING_W * 2;
          return (
            <span
              key={h}
              style={{
                position: 'absolute',
                width: ringDiameter,
                height: ringDiameter,
                borderRadius: '50%',
                border: `${RING_W}px solid ${HEALTH_COLOR[h]}`,
                boxSizing: 'border-box',
              }}
            />
          );
        })}

        {collectionTint && (
          <span
            style={{
              position: 'absolute',
              width: diameter + (RING_W + 2) * 2,
              height: diameter + (RING_W + 2) * 2,
              borderRadius: '50%',
              border: `${RING_W}px solid ${collectionTint}`,
              boxSizing: 'border-box',
            }}
          />
        )}

        {isRich && heroSrc ? (
          <img
            src={heroSrc}
            alt=""
            style={{
              width: diameter,
              height: diameter,
              borderRadius: tokens.poi.hero.radius,
              border: `${tokens.poi.hero.borderWidth} solid ${STATE_COLOR[state]}`,
              objectFit: 'cover',
            }}
          />
        ) : showThumb ? (
          <img
            src={heroSrc}
            alt=""
            style={{
              width: THUMB_PX,
              height: THUMB_PX,
              borderRadius: '50%',
              border: `2px solid ${STATE_COLOR[state]}`,
              objectFit: 'cover',
            }}
          />
        ) : (
          <span
            style={{
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              background: STATE_COLOR[state],
              border: `2px solid ${ORIGIN_BORDER[origin]}`,
              boxSizing: 'border-box',
            }}
          />
        )}

        {isRich && glyph && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: `${HEALTH_COLOR.review}`,
              boxShadow: `0 0 0 1.5px hsl(${tokens.color.light.surface.background})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dangerouslySetInnerHTML={{
                __html:
                  glyph === 'coordinate'
                    ? COHERENCE_GLYPH_PATH_COORDINATE
                    : COHERENCE_GLYPH_PATH_NAME,
              }}
            />
          </span>
        )}
      </div>
      {label && (
        <span
          style={{
            font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/${tokens.typography.lineHeight.caption} ${tokens.typography.fontFamily.body}`,
            color: `hsl(${tokens.color.light.text.primary})`,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/** Generic background tile mimicking the map canvas, for stories. */
export function MapCanvas({
  children,
  width = 720,
  height = 420,
  zoomBadge,
}: {
  children: React.ReactNode;
  width?: number;
  height?: number;
  zoomBadge?: string;
}) {
  const tileA = hsl(tokens.map.canvas.tileA);
  const tileB = hsl(tokens.map.canvas.tileB);
  const tileSize = parseInt(tokens.map.canvas.tileSize, 10);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background: `repeating-linear-gradient(45deg, ${tileA} 0 ${tileSize}px, ${tileB} ${tileSize}px ${tileSize * 2}px)`,
        borderRadius: tokens.radius.lg,
        boxShadow: tokens.elevation.shadow.md,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 32,
        padding: 24,
      }}
    >
      {children}
      {zoomBadge && (
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: `hsl(${tokens.color.light.text.primary} / 0.78)`,
            color: `hsl(${tokens.color.light.surface.background})`,
            font: `${tokens.typography.weight.semibold} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.mono}`,
            padding: '4px 8px',
            borderRadius: tokens.radius.sm,
          }}
        >
          {zoomBadge}
        </span>
      )}
    </div>
  );
}
