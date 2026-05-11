/**
 * PopupFocused — popup in selected/focused state.
 *
 * Triggered when the POI is selected from search, from a route, or by direct
 * map click. Validates the focus outline + popup shadow combination outside
 * the main 5×3 matrix to keep that grid simple.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { PopupPreview } from './PopupPreview';
import { tokens } from '@/design-system/tokens';

const meta: Meta = {
  title: 'Map Lab/Popup/Focused',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

const HERO_SAMPLE =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=70&auto=format&fit=crop';

export const FromSearch: Story = {
  render: () => (
    <Frame label="Selected from search">
      <PopupPreview
        origin="my"
        state="enriched"
        focused
        heroSrc={HERO_SAMPLE}
        title="Mirador de A Curota"
      />
    </Frame>
  ),
};

export const FromRoute: Story = {
  render: () => (
    <Frame label="Selected as route waypoint">
      <PopupPreview
        origin="followed"
        state="enriched"
        focused
        heroSrc={HERO_SAMPLE}
        title="Faro de Corrubedo"
      />
    </Frame>
  ),
};

export const LoadingFocused: Story = {
  render: () => (
    <Frame label="Focused while enriching">
      <PopupPreview
        origin="my"
        state="loadingEnrichment"
        focused
        title="Punto seleccionado"
      />
    </Frame>
  ),
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 64,
        background: `hsl(${tokens.color.light.background})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        fontFamily: tokens.typography.fontFamily.body,
        color: `hsl(${tokens.color.light.foreground})`,
      }}
    >
      <span
        style={{
          font: `${tokens.typography.weight.medium} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.mono}`,
          color: `hsl(${tokens.color.light.mutedForeground})`,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
