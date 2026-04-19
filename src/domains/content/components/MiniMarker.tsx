/**
 * MiniMarker — Renders a 12px replica of the actual on-map marker shape/color
 * for use in document panel lists. Mirrors the SVGs in `map-icons.ts`.
 */
import React from 'react';
import { useMarkerSizeConfig } from '@/components/map/useMarkerSizeConfig';
import { getWaypointMiniStyle, getRouteMiniStyle } from '@/domains/content/lib/waypoint-color';
import type { DocWaypointRow, DocRouteRow } from './DocumentWaypointsTabs';

interface MiniMarkerProps {
  loc?: DocWaypointRow;
  route?: DocRouteRow;
  size?: number;
}

export function MiniMarker({ loc, route, size = 14 }: MiniMarkerProps) {
  // Subscribe to live config so colors stay in sync with Back Office edits.
  useMarkerSizeConfig();

  const style = loc
    ? getWaypointMiniStyle(loc)
    : route
      ? getRouteMiniStyle(route)
      : null;

  if (!style) return null;

  const gradId = `mini-${loc?.id || route?.id || 'x'}`;

  if (style.shape === 'pin') {
    // Teardrop replica (matches map-icons.ts pin path).
    const w = size * 0.7;
    const h = size;
    return (
      <svg width={w} height={h} viewBox="0 0 24 36" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={style.colorLight} />
            <stop offset="100%" stopColor={style.color} />
          </linearGradient>
        </defs>
        <path
          d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z"
          fill={`url(#${gradId})`}
          stroke="hsl(var(--background))"
          strokeWidth="2"
        />
        {style.hasInnerDot && <circle cx="12" cy="12" r="3" fill="white" fillOpacity="0.95" />}
      </svg>
    );
  }

  // Circle (workspace unknown/new, catalog new/empty, route).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={style.colorLight} />
          <stop offset="100%" stopColor={style.color} />
        </linearGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill={`url(#${gradId})`}
        stroke="hsl(var(--background))"
        strokeWidth="2"
      />
    </svg>
  );
}
