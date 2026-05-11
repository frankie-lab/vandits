import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';
import type { PoiOrigin, PoiVisualState, PoiRenderMode } from '@/design-system/map/types';

const meta = {
  title: 'Map Lab/Density/MapDensityStress',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ORIGINS: PoiOrigin[] = ['my', 'followed', 'service', 'catalog'];
const STATES: PoiVisualState[] = ['enriched', 'imported', 'empty'];

function deterministic(n: number, salt: number): number {
  return ((n * 9301 + salt * 49297) % 233280) / 233280;
}

function Grid({ count, renderMode }: { count: number; renderMode: PoiRenderMode }) {
  const cols = Math.ceil(Math.sqrt(count * 1.6));
  return (
    <MapCanvas width={960} height={560} zoomBadge={`density=${count} · ${renderMode}`}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: renderMode === 'micro' ? 4 : 8,
          width: '100%',
          height: '100%',
          placeItems: 'center',
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const origin = ORIGINS[Math.floor(deterministic(i, 1) * ORIGINS.length)];
          const state = STATES[Math.floor(deterministic(i, 2) * STATES.length)];
          return <PoiPreview key={i} origin={origin} state={state} renderMode={renderMode} />;
        })}
      </div>
    </MapCanvas>
  );
}

/**
 * Stress tests across the three density tiers called out in the plan:
 *   - 100  points  → still readable at standard zoom
 *   - 500  points  → compact recommended
 *   - 2000 points  → micro mode obligatorio
 *
 * These stories are intentionally static (no clustering) to expose raw
 * density at each tier. Clustering belongs to product code, not the lab.
 */
export const Density100Standard: Story = {
  render: () => <Grid count={100} renderMode="standard" />,
};

export const Density500Compact: Story = {
  render: () => <Grid count={500} renderMode="compact" />,
};

export const Density2000Micro: Story = {
  render: () => <Grid count={2000} renderMode="micro" />,
};
