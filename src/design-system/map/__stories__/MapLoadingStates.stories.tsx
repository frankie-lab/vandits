import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';
import type { PoiOrigin, PoiVisualState } from '@/design-system/map/types';

const meta = {
  title: 'Map Lab/States/MapLoadingStates',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Loading + edge states the map can be in. Helps the team align on
 * what users SHOULD see while tiles, markers, or rings hydrate.
 */
export const Skeleton: Story = {
  render: () => (
    <MapCanvas width={520} height={300} zoomBadge="loading · skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'hsl(220 10% 60% / 0.45)',
            animation: 'pulse 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{'@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.85}}'}</style>
    </MapCanvas>
  ),
};

export const StaleData: Story = {
  render: () => (
    <MapCanvas width={520} height={300} zoomBadge="stale · awaiting refresh">
      <PoiPreview state="imported" health={['chain']} label="stale chain" />
      <PoiPreview state="imported" health={['chain']} label="stale chain" />
      <PoiPreview state="imported" health={['chain']} label="stale chain" />
    </MapCanvas>
  ),
};

export const PartialEnrichment: Story = {
  render: () => {
    const origins: PoiOrigin[] = ['my', 'my', 'my', 'my', 'my', 'my'];
    const states: PoiVisualState[] = ['enriched', 'enriched', 'imported', 'imported', 'empty', 'empty'];
    return (
      <MapCanvas width={520} height={300} zoomBadge="partial enrichment in progress">
        {origins.map((o, i) => (
          <PoiPreview key={i} origin={o} state={states[i]} />
        ))}
      </MapCanvas>
    );
  },
};

export const Empty: Story = {
  render: () => (
    <MapCanvas width={520} height={300} zoomBadge="empty viewport">
      <span style={{ color: 'hsl(220 10% 46%)', font: '500 14px/1.4 system-ui' }}>
        No POIs in this area
      </span>
    </MapCanvas>
  ),
};
