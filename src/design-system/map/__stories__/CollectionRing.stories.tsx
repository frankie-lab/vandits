import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';

const meta = {
  title: 'Map Lab/Rings/CollectionRing',
  component: PoiPreview,
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Collection tint ring sits BETWEEN the marker and the health rings.
 * Always 5px wide with a 2px gap to the marker (token: poi.ring.collectionGap).
 * Multiple collections never stack — only the active/primary tint is shown.
 */
export const TintExamples: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview state="enriched" collectionTint="#8b5cf6" label="violet" />
      <PoiPreview state="enriched" collectionTint="#0ea5e9" label="sky" />
      <PoiPreview state="enriched" collectionTint="#ec4899" label="pink" />
      <PoiPreview state="imported" collectionTint="#10b981" label="emerald · imported" />
      <PoiPreview state="empty" collectionTint="#f59e0b" label="amber · empty" />
    </MapCanvas>
  ),
};
