import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';
import type { PoiVisualState } from '@/design-system/map/types';

const meta = {
  title: 'Map Lab/Markers/FollowedPoiMarker',
  component: PoiPreview,
  args: { origin: 'followed', renderMode: 'standard' },
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatePalette: Story = {
  render: (args) => (
    <MapCanvas>
      {(['enriched', 'imported', 'empty'] as PoiVisualState[]).map((s) => (
        <PoiPreview key={s} {...args} state={s} label={`followed · ${s}`} />
      ))}
    </MapCanvas>
  ),
};

export const VsMyComparison: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview origin="my" state="enriched" label="mine" />
      <PoiPreview origin="followed" state="enriched" label="followed" />
      <PoiPreview origin="catalog" state="enriched" label="catalog" />
    </MapCanvas>
  ),
};
