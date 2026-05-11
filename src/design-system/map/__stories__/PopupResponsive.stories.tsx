/**
 * PopupResponsive — same enriched popup at 320 / 375 / 414 / 768 px.
 *
 * Validates the internal wrapper clamp (min/max from popup.json) and that the
 * header/body/action-row never overflow the parent container.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { PopupPreview } from './PopupPreview';
import { tokens } from '@/design-system/tokens';

const meta: Meta = {
  title: 'Map Lab/Popup/Responsive',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const WIDTHS = [320, 375, 414, 768];

const HERO_SAMPLE =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=70&auto=format&fit=crop';

export const ViewportWidths: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        background: `hsl(${tokens.color.light.background})`,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        fontFamily: tokens.typography.fontFamily.body,
        color: `hsl(${tokens.color.light.foreground})`,
      }}
    >
      {WIDTHS.map((w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            style={{
              font: `${tokens.typography.weight.semibold} ${tokens.typography.size.caption}/1 ${tokens.typography.fontFamily.mono}`,
              color: `hsl(${tokens.color.light.mutedForeground})`,
            }}
          >
            container = {w}px
          </span>
          <div
            style={{
              width: w,
              border: `1px dashed hsl(${tokens.color.light.border})`,
              padding: 8,
            }}
          >
            <PopupPreview
              origin="my"
              state="enriched"
              heroSrc={HERO_SAMPLE}
              width="100%"
            />
          </div>
        </div>
      ))}
    </div>
  ),
};
