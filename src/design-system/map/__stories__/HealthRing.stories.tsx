import type { Meta, StoryObj } from '@storybook/react';
import { PoiPreview, MapCanvas, COLLECTION_TINT_SAMPLE } from './PoiPreview';

/**
 * Health Rings v2 — additive 5px concentric modifiers OUTSIDE the marker
 * and the collection-tint ring. Order (inner → outer):
 *   1. partial   → amber light  · faltan niveles administrativos
 *   2. chain     → yellow       · cadena admin rota / nombre desactualizado
 *   3. review    → magenta      · revisión semántica (coherence/no_match/llm_unverifiable)
 *   4. hardError → red          · fallo técnico (rate_limit/timeout/network/...)
 *
 * Reglas:
 *  - Solo se pintan en `renderMode ∈ {standard, rich}`.
 *  - El glyph (MapPin / Type) solo aparece en `rich` cuando el bucket es
 *    `review` y el `mismatchKind` es `coordinate` o `name`.
 *  - El stroke blanco interior y el `collection-tint-ring` nunca se sustituyen.
 */
const meta = {
  title: 'Map Lab/Rings/HealthRing',
  component: PoiPreview,
} satisfies Meta<typeof PoiPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cada bucket aislado, en `standard`. */
export const SingleStandard: Story = {
  render: () => (
    <MapCanvas zoomBadge="standard">
      <PoiPreview state="enriched" health={['partial']} label="partial" />
      <PoiPreview state="enriched" health={['chain']} label="chain" />
      <PoiPreview state="imported" health={['review']} label="review" />
      <PoiPreview state="empty" health={['hardError']} label="hardError" />
    </MapCanvas>
  ),
};

/** Mismos buckets en `rich` — el polaroid es más grande, los rings idem. */
export const SingleRich: Story = {
  render: () => (
    <MapCanvas zoomBadge="rich">
      <PoiPreview renderMode="rich" state="enriched" health={['partial']} label="partial" />
      <PoiPreview renderMode="rich" state="enriched" health={['chain']} label="chain" />
      <PoiPreview renderMode="rich" state="imported" health={['review']} label="review" />
      <PoiPreview renderMode="rich" state="empty" health={['hardError']} label="hardError" />
    </MapCanvas>
  ),
};

/** Combinaciones múltiples: validan stacking inner→outer. */
export const Stacked: Story = {
  render: () => (
    <MapCanvas zoomBadge="standard">
      <PoiPreview state="imported" health={['partial', 'chain']} label="partial + chain" />
      <PoiPreview state="imported" health={['chain', 'review']} label="chain + review" />
      <PoiPreview state="imported" health={['partial', 'chain', 'hardError']} label="partial + chain + hardError" />
      <PoiPreview state="imported" health={['partial', 'chain', 'review', 'hardError']} label="todos" />
    </MapCanvas>
  ),
};

/** review + glyph (`coordinate`) — solo visible en `rich`. */
export const ReviewGlyphCoordinate: Story = {
  render: () => (
    <MapCanvas zoomBadge="rich">
      <PoiPreview renderMode="standard" state="imported" health={['review']} glyph="coordinate" label="standard (sin glyph)" />
      <PoiPreview renderMode="rich" state="imported" health={['review']} glyph="coordinate" label="rich + glyph coords" />
    </MapCanvas>
  ),
};

/** review + glyph (`name`) — homónimos. */
export const ReviewGlyphName: Story = {
  render: () => (
    <MapCanvas zoomBadge="rich">
      <PoiPreview renderMode="standard" state="imported" health={['review']} glyph="name" label="standard (sin glyph)" />
      <PoiPreview renderMode="rich" state="imported" health={['review']} glyph="name" label="rich + glyph name" />
    </MapCanvas>
  ),
};

/** Health rings + collection tint — el tinte sigue legible entre marker y rings. */
export const WithCollectionTint: Story = {
  render: () => (
    <MapCanvas>
      <PoiPreview
        state="imported"
        health={['chain', 'review']}
        collectionTint={COLLECTION_TINT_SAMPLE.violet}
        label="chain + review + tint"
      />
      <PoiPreview
        renderMode="rich"
        state="enriched"
        health={['partial', 'hardError']}
        collectionTint={COLLECTION_TINT_SAMPLE.emerald}
        glyph="coordinate"
        label="rich + 2 rings + tint + glyph"
      />
    </MapCanvas>
  ),
};

/** compact / micro: los rings NUNCA se pintan (regla `renderMode ∈ {standard, rich}`). */
export const NoRingsBelowStandard: Story = {
  render: () => (
    <MapCanvas zoomBadge="micro / compact">
      <PoiPreview renderMode="micro" state="imported" health={['partial', 'chain', 'review', 'hardError']} label="micro (sin rings)" />
      <PoiPreview renderMode="compact" state="imported" health={['partial', 'chain', 'review', 'hardError']} label="compact (sin rings)" />
    </MapCanvas>
  ),
};
