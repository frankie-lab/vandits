/**
 * Skeletons — Catálogo visual (DS-UX1A · PR-2).
 *
 * 5 patrones individuales + grid de densidad alta (10× PoiCardSkeleton)
 * para validar ritmo visual y ausencia de tamaños hardcoded.
 */
import type { Meta, StoryObj } from '@storybook/react';
import {
  PoiCardSkeleton,
  PoiPopupSkeleton,
  PanelListSkeleton,
  HeroImageSkeleton,
  BadgeRowSkeleton,
} from '@/design-system/patterns/Skeletons';

const meta: Meta = {
  title: 'Patterns/Skeletons',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

function Frame({ title, children, width = 360 }: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-caption text-muted-foreground uppercase tracking-wide">{title}</div>
      <div className="border border-border/40 rounded-token-lg overflow-hidden bg-background" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

export const Catalog: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8 max-w-[800px]">
      <Frame title="PoiCardSkeleton">
        <PoiCardSkeleton />
      </Frame>
      <Frame title="BadgeRowSkeleton count=4">
        <div className="p-4">
          <BadgeRowSkeleton count={4} />
        </div>
      </Frame>
      <Frame title="HeroImageSkeleton 16/9">
        <HeroImageSkeleton ratio="16/9" />
      </Frame>
      <Frame title="HeroImageSkeleton 1/1" width={200}>
        <HeroImageSkeleton ratio="1/1" />
      </Frame>
      <Frame title="PanelListSkeleton rows=4">
        <PanelListSkeleton rows={4} />
      </Frame>
      <Frame title="PoiPopupSkeleton">
        <PoiPopupSkeleton />
      </Frame>
    </div>
  ),
};

export const HighDensity: Story = {
  render: () => (
    <Frame title="PanelListSkeleton rows=10 (ritmo visual)">
      <PanelListSkeleton rows={10} />
    </Frame>
  ),
};
