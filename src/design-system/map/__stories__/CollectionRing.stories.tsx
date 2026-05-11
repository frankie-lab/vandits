import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas, COLLECTION_TINT_SAMPLE } from './PoiPreview';

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
 * Tints below are tokenized samples (tokens.poi.collectionTintSample).
 */
export const TintExamples: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview state="enriched" collectionTint={COLLECTION_TINT_SAMPLE.violet} label="violet" />
      <PoiPreview state="enriched" collectionTint={COLLECTION_TINT_SAMPLE.sky} label="sky" />
      <PoiPreview state="enriched" collectionTint={COLLECTION_TINT_SAMPLE.pink} label="pink" />
      <PoiPreview state="imported" collectionTint={COLLECTION_TINT_SAMPLE.emerald} label="emerald · imported" />
      <PoiPreview state="empty" collectionTint={COLLECTION_TINT_SAMPLE.amber} label="amber · empty" />
    </MapCanvas>
  ),
};
