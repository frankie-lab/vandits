/**
 * PopupMatrix — Canonical 5×3 grid of popup states × origins.
 *
 * Rows (state):  imported · empty · loadingEnrichment · enriched · error
 * Cols (origin): my · followed · service
 *
 * Single-source-of-truth visual reference. Lives outside Leaflet.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { PopupPreview, type PopupOrigin, type PopupState } from './PopupPreview';
import { tokens } from '@/design-system/tokens';

const meta: Meta = {
  title: 'Map Lab/Popup/Matrix',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

const STATES: PopupState[] = [
  'imported',
  'empty',
  'loadingEnrichment',
  'enriched',
  'error',
];
const ORIGINS: PopupOrigin[] = ['my', 'followed', 'service'];

const HERO_SAMPLE =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=70&auto=format&fit=crop';

export const Matrix5x3: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        background: `hsl(${tokens.color.light.background})`,
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: `auto repeat(${ORIGINS.length}, 1fr)`,
        gap: 24,
        alignItems: 'start',
        fontFamily: tokens.typography.fontFamily.body,
        color: `hsl(${tokens.color.light.foreground})`,
      }}
    >
      <div />
      {ORIGINS.map((o) => (
        <h3
          key={o}
          style={{
            margin: 0,
            font: `${tokens.typography.weight.semibold} ${tokens.typography.size.h3}/${tokens.typography.lineHeight.h3} ${tokens.typography.fontFamily.body}`,
            textTransform: 'capitalize',
          }}
        >
          {o}
        </h3>
      ))}

      {STATES.map((s) => (
        <RowFragment key={s} state={s} />
      ))}
    </div>
  ),
};

function RowFragment({ state }: { state: PopupState }) {
  return (
    <>
      <div
        style={{
          font: `${tokens.typography.weight.medium} ${tokens.typography.size.body}/${tokens.typography.lineHeight.body} ${tokens.typography.fontFamily.body}`,
          color: `hsl(${tokens.color.light.mutedForeground})`,
          alignSelf: 'center',
        }}
      >
        {state}
      </div>
      {ORIGINS.map((o) => (
        <div key={`${state}-${o}`}>
          <PopupPreview
            origin={o}
            state={state}
            heroSrc={state === 'enriched' ? HERO_SAMPLE : undefined}
          />
        </div>
      ))}
    </>
  );
}
