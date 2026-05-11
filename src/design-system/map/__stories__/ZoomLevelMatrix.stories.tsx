import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';
import { tokens } from '@/design-system/tokens';
import {
  getMapZoomBand,
} from '@/design-system/map/rules/zoom-thresholds';

const meta = {
  title: 'Map Lab/Zoom/ZoomLevelMatrix',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ZOOM_SAMPLES = [4, 8, 11, 14, 16, 18];

/**
 * Visual matrix of render modes across zoom levels. Helps spot density
 * cliffs and verifies that `getMapZoomBand(zoom)` matches the tokenized
 * thresholds (map.zoom.microMax/compactMax/standardMax/richMin).
 */
export const Matrix: Story = {
  render: () => (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <pre style={{ font: tokens.typography.fontFamily.mono, fontSize: 12, margin: 0 }}>
{`thresholds: micro≤${tokens.map.zoom.microMax} · compact≤${tokens.map.zoom.compactMax} · standard≤${tokens.map.zoom.standardMax} · rich≥${tokens.map.zoom.richMin}`}
      </pre>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {ZOOM_SAMPLES.map((z) => {
          const band = getMapZoomBand(z);
          return (
            <MapCanvas key={z} width={300} height={180} zoomBadge={`z=${z} · ${band}`}>
              <PoiPreview origin="my" state="enriched" renderMode={band} />
              <PoiPreview origin="followed" state="imported" renderMode={band} />
              <PoiPreview origin="service" state="imported" renderMode={band} />
            </MapCanvas>
          );
        })}
      </div>
    </div>
  ),
};
