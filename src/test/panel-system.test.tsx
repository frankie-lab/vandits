/**
 * Panel System tests — valida tokens y API de los componentes canónicos.
 *
 * No testea apariencia visual (eso es QA manual sobre el piloto). Testea:
 *   1. Tokens JS coherentes con los CSS vars (mismo orden de magnitud).
 *   2. PanelShell renderiza con data-panel-variant correcto.
 *   3. PanelTabs.Group renderiza label + triggers.
 *   4. PanelEmptyState avisa si falta icon/title.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FolderOpen } from 'lucide-react';
import {
  PanelShell,
  PanelTabs,
  PanelEmptyState,
  PANEL_TOKENS,
  PANEL_VARIANT_DENSITY,
} from '@/shared/components/ui/panel';

describe('Panel System — tokens', () => {
  it('exposes canonical numeric tokens', () => {
    expect(PANEL_TOKENS.headerHeight).toBe(56);
    expect(PANEL_TOKENS.footerMinHeight).toBe(72);
    expect(PANEL_TOKENS.paddingX).toBe(16);
    expect(PANEL_TOKENS.tabsHeight).toBe(40);
    expect(PANEL_TOKENS.tabsRadius).toBe(12);
  });

  it('defines density per variant', () => {
    expect(PANEL_VARIANT_DENSITY.form.sectionGap).toBeGreaterThanOrEqual(
      PANEL_VARIANT_DENSITY.library.sectionGap,
    );
    expect(PANEL_VARIANT_DENSITY.workflow).toBeDefined();
  });
});

describe('Panel System — PanelShell', () => {
  it('renders with data-panel-variant attribute', () => {
    render(
      <PanelShell
        title="Test panel"
        icon={<FolderOpen data-testid="icon" />}
        isOpen
        onClose={() => undefined}
        variant="library"
      >
        <div data-testid="content">hello</div>
      </PanelShell>,
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(document.querySelector('[data-panel-variant="library"]')).not.toBeNull();
  });
});

describe('Panel System — PanelTabs.Group', () => {
  it('renders label and triggers inside a controlled Tabs root', () => {
    render(
      <PanelTabs value="a" onValueChange={() => undefined}>
        <PanelTabs.Header>
          <PanelTabs.Group label="Fuentes">
            <PanelTabs.Trigger value="a">Alpha</PanelTabs.Trigger>
            <PanelTabs.Trigger value="b">Beta</PanelTabs.Trigger>
          </PanelTabs.Group>
        </PanelTabs.Header>
        <PanelTabs.Content value="a">CONTENT_A</PanelTabs.Content>
      </PanelTabs>,
    );

    expect(screen.getByText('Fuentes')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByText('CONTENT_A')).toBeInTheDocument();
  });
});

describe('Panel System — PanelEmptyState', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('renders icon, title and optional description', () => {
    render(
      <PanelEmptyState
        icon={<FolderOpen data-testid="empty-icon" />}
        title="Nothing yet"
        description="Import files to see them here."
      />,
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('Import files to see them here.')).toBeInTheDocument();
  });

  it('warns in DEV when icon or title are missing', () => {
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // @ts-expect-error — intentional contract violation for test
    render(<PanelEmptyState title="No icon" />);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
