/**
 * @vandits/design-system/map/__stories__/PoiPreview
 *
 * Storybook-only renderer that mirrors what `createCustomIcon` produces, but
 * as a pure SVG/HTML component. Reads exclusively from design tokens so any
 * drift in tokens is visible in the Map Lab without booting Leaflet.
 *
 * Used by every Map Lab story. Do not import from product code.
 */
import * as React from 'react';
import { tokens } from '@/design-system/tokens/build/tokens';
import type {
  PoiOrigin,
  PoiRenderMode,
  PoiVisualState,
  PoiHealthState,
} from '@/design-system/map/types';

const STATE_COLOR: Record<PoiVisualState, string> = {
  enriched: tokens.poi.state.enriched,
  imported: tokens.poi.state.imported,
  empty: tokens.poi.state.empty,
};

const HEALTH_COLOR: Record<PoiHealthState, string> = {
  error: tokens.poi.ring.error,
  chain: tokens.poi.ring.chain,
  empty: tokens.poi.ring.empty,
};

const RENDER_SCALE: Record<PoiRenderMode, number> = {
  micro: tokens.poi.renderScale.micro,
  compact: tokens.poi.renderScale.compact,
  standard: tokens.poi.renderScale.standard,
  rich: tokens.poi.renderScale.rich,
};

// Visual differentiator for origin (matches product semantics, no inline literals beyond these).
const ORIGIN_BORDER: Record<PoiOrigin, string> = {
  my: '#ffffff',
  followed: '#fde68a', // amber tint border = followed user
  service: '#bae6fd', // sky tint border = service POI (gas, parking, etc.)
  catalog: '#ddd6fe', // violet tint border = inherited catalog
};

const RING_W = parseInt(tokens.poi.ring.width, 10); // px
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
  /** Optional collection tint (inner ring, 2px gap to marker). */
  collectionTint?: string | null;
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
  label,
}: PoiPreviewProps) {
  const scale = RENDER_SCALE[renderMode];
  const isMicro = renderMode === 'micro';
  const isRich = renderMode === 'rich';

  // Base marker diameter in standard mode
  const baseDiameter = isMicro ? DOT_PX : isRich ? HERO_PX : 28;
  const diameter = isMicro ? DOT_PX : Math.round(baseDiameter * scale);

  // Ordered: error → chain → empty (outermost first)
  const orderedHealth: PoiHealthState[] = (['error', 'chain', 'empty'] as const).filter(
    (h) => health.includes(h),
  );

  const ringPad = orderedHealth.length * RING_W + (collectionTint ? RING_W + 2 : 0);
  const totalDiameter = diameter + ringPad * 2 + (focused ? 4 : 0);

  const showThumb = focused && heroSrc && !isMicro && !isRich;

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
        {/* Health rings (outermost) */}
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

        {/* Collection tint ring */}
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

        {/* The marker itself */}
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
      </div>
      {label && (
        <span
          style={{
            font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/${tokens.typography.lineHeight.caption} ${tokens.typography.fontFamily.body}`,
            color: 'hsl(220 20% 14%)',
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
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background:
          'repeating-linear-gradient(45deg, #e7e3da 0 24px, #ddd9d0 24px 48px)',
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
            background: 'hsl(220 20% 14% / 0.78)',
            color: '#fff',
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
