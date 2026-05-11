import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';
import type { PoiVisualState } from '@/design-system/map/types';

const meta = {
  title: 'Map Lab/Markers/MyPoiMarker',
  component: PoiPreview,
  args: { origin: 'my', renderMode: 'standard' },
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatePalette: Story = {
  render: (args) => (
    <MapCanvas>
      {(['enriched', 'imported', 'empty'] as PoiVisualState[]).map((s) => (
        <PoiPreview key={s} {...args} state={s} label={`my · ${s}`} />
      ))}
    </MapCanvas>
  ),
};

export const Focused: Story = {
  args: { state: 'enriched', focused: true, heroSrc: 'https://picsum.photos/seed/poi/64' },
  render: (args) => (
    <MapCanvas>
      <PoiPreview {...args} label="my · enriched · focused" />
    </MapCanvas>
  ),
};
