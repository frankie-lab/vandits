import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas } from './PoiPreview';

const meta = {
  title: 'Map Lab/Rings/HealthRing',
  component: PoiPreview,
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Health rings are additive 5px concentric modifiers OUTSIDE the marker
 * and the collection-tint ring. Order (outermost → innermost):
 *   1. red    → enrichment error
 *   2. amber  → broken/stale admin chain
 *   3. orange → empty (no description)
 * Stacking multiple rings is legal and tested here.
 */
export const Single: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview state="enriched" health={['error']} label="error only" />
      <PoiPreview state="enriched" health={['chain']} label="chain only" />
      <PoiPreview state="empty" health={['empty']} label="empty only" />
    </MapCanvas>
  ),
};

export const Stacked: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview state="imported" health={['error', 'chain']} label="error + chain" />
      <PoiPreview state="imported" health={['chain', 'empty']} label="chain + empty" />
      <PoiPreview state="imported" health={['error', 'chain', 'empty']} label="all three" />
    </MapCanvas>
  ),
};

export const WithCollectionTint: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview
        state="imported"
        health={['error', 'chain']}
        collectionTint="#8b5cf6"
        label="health + tint"
      />
    </MapCanvas>
  ),
};
