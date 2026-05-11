import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';

const meta = {
  title: 'Map Lab/Markers/ServicePoiMarker',
  component: PoiPreview,
  args: { origin: 'service', renderMode: 'standard', state: 'imported' },
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Service POIs (gas stations, parking, restrooms…) are not user content.
 * They share the gray "imported" palette but carry a sky tint border to read
 * as utility/infrastructure rather than personal catalog.
 */
export const Default: Story = {
  render: (args) => (
    <MapCanvas>
      <PoiPreview {...args} label="service · gas" />
      <PoiPreview {...args} renderMode="compact" label="service · compact" />
      <PoiPreview {...args} renderMode="micro" label="service · micro" />
    </MapCanvas>
  ),
};
