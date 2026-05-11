/**
 * PanelShellLoading — Catálogo visual del contrato de loading (DS-UX1A · PR-3).
 *
 * 4 escenarios × 3 variantes (form/library/workflow) demostrando:
 *   - Fetch inicial: fallback reemplaza children, spinner en header
 *   - Refresh parcial: children intactos, solo spinner en header
 *   - Vacío real: children renderizados (empty state lo gestiona la feature)
 *   - Normal: panel sin loading
 *
 * No abre `FloatingPanel` real (requeriría portal y un mount con Provider).
 * Renderiza una versión inline del shell para validar la composición visual.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { FolderOpen, Settings, Workflow } from 'lucide-react';
import { AppSpinner } from '@/shared/components/ui/AppSpinner';
import { PanelListSkeleton } from '@/design-system/patterns/Skeletons';
import type { PanelVariant } from '@/shared/components/ui/panel/tokens';

const meta: Meta = {
  title: 'Patterns/PanelShell/Loading',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const VARIANT_ICON: Record<PanelVariant, React.ReactNode> = {
  form: <Settings className="w-4 h-4 text-primary" />,
  library: <FolderOpen className="w-4 h-4 text-primary" />,
  workflow: <Workflow className="w-4 h-4 text-primary" />,
};

interface ShellPreviewProps {
  variant: PanelVariant;
  loading?: boolean;
  hasContent?: boolean;
  loadingFallback?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}

/**
 * Réplica inline del contrato visual de PanelShell para Storybook.
 * Mantiene paridad con el componente real sin necesidad de portal.
 */
function ShellPreview({
  variant,
  loading = false,
  hasContent = false,
  loadingFallback,
  children,
  title,
}: ShellPreviewProps) {
  const showFallback = loading && !hasContent;
  return (
    <div
      data-panel-variant={variant}
      className="w-[360px] h-[480px] flex flex-col bg-background border border-border/50 rounded-[var(--panel-radius)] overflow-hidden shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 shrink-0 h-[var(--panel-header-h)] px-[var(--panel-padding-x)]">
        <div className="flex items-center gap-2 min-w-0">
          {VARIANT_ICON[variant]}
          <span className="font-medium text-sm truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {loading && <AppSpinner size="xs" />}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {showFallback
          ? (loadingFallback ?? <PanelListSkeleton rows={4} />)
          : children}
      </div>
    </div>
  );
}

function FakeRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 h-[var(--control-h-xl)] px-[var(--panel-padding-x)] border-b border-border/40">
      <div className="w-[var(--icon-xl)] h-[var(--icon-xl)] rounded-full bg-muted" />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-sm font-medium truncate">{label}</span>
        <span className="text-caption text-muted-foreground">Subtítulo de ejemplo</span>
      </div>
    </div>
  );
}

function FakeList() {
  return (
    <div className="flex flex-col">
      {['Punto A', 'Punto B', 'Punto C', 'Punto D'].map((l) => (
        <FakeRow key={l} label={l} />
      ))}
    </div>
  );
}

function FakeEmpty() {
  return (
    <div className="h-full flex items-center justify-center text-caption text-muted-foreground p-[var(--panel-empty-padding)]">
      Sin elementos
    </div>
  );
}

export const InitialFetch: Story = {
  name: '1 · Fetch inicial (hasContent=false, loading=true)',
  render: () => (
    <div className="flex gap-6 flex-wrap">
      {(['form', 'library', 'workflow'] as PanelVariant[]).map((v) => (
        <ShellPreview key={v} variant={v} loading hasContent={false} title={`Panel ${v}`}>
          <FakeList />
        </ShellPreview>
      ))}
    </div>
  ),
};

export const PartialRefresh: Story = {
  name: '2 · Refresh parcial (hasContent=true, loading=true)',
  render: () => (
    <div className="flex gap-6 flex-wrap">
      {(['form', 'library', 'workflow'] as PanelVariant[]).map((v) => (
        <ShellPreview key={v} variant={v} loading hasContent title={`Panel ${v}`}>
          <FakeList />
        </ShellPreview>
      ))}
    </div>
  ),
};

export const RealEmpty: Story = {
  name: '3 · Vacío real (hasContent=false, loading=false)',
  render: () => (
    <div className="flex gap-6 flex-wrap">
      {(['form', 'library', 'workflow'] as PanelVariant[]).map((v) => (
        <ShellPreview key={v} variant={v} title={`Panel ${v}`}>
          <FakeEmpty />
        </ShellPreview>
      ))}
    </div>
  ),
};

export const Normal: Story = {
  name: '4 · Normal (hasContent=true, loading=false)',
  render: () => (
    <div className="flex gap-6 flex-wrap">
      {(['form', 'library', 'workflow'] as PanelVariant[]).map((v) => (
        <ShellPreview key={v} variant={v} hasContent title={`Panel ${v}`}>
          <FakeList />
        </ShellPreview>
      ))}
    </div>
  ),
};
