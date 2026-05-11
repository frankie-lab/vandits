import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';

const meta = {
  title: 'Map Lab/Markers/MicroPoiDot',
  component: PoiPreview,
  args: { renderMode: 'micro' },
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Micro dot is the lowest-density render mode (zoom ≤ map.zoom.microMax).
 * Confirms the dot stays legible at 6px without health rings or hero image.
 */
export const PaletteSweep: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview origin="my" state="enriched" renderMode="micro" label="enriched" />
      <PoiPreview origin="my" state="imported" renderMode="micro" label="imported" />
      <PoiPreview origin="my" state="empty" renderMode="micro" label="empty" />
      <PoiPreview origin="followed" state="enriched" renderMode="micro" label="followed" />
      <PoiPreview origin="service" state="imported" renderMode="micro" label="service" />
    </MapCanvas>
  ),
};
