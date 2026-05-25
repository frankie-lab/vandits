/**
 * import-row2-below-row1.spec.ts
 *
 * PR-IMPORT-CANON-1 — Contrato visual del panel "Fuentes de importación".
 *
 * Verifica que, para CADA fuente (archivos · web · imágenes), la fila 2
 * (segmented control "acción ↔ histórico") está renderizada INMEDIATAMENTE
 * debajo de la fila 1 (pestañas principales), dentro de la pestaña activa.
 *
 * Reglas duras del canon (ver `src/components/ImportedContentPanel.tsx` y
 * mem://logic/import/import-canon):
 *   - Fila 1: `[data-import-source-tab="<source>"]` (3 triggers en un único Group).
 *   - Fila 2: `[data-import-subview-row="<source>"]` dentro del
 *     `[data-import-source-content="<source>"]` activo.
 *   - Fila 2 debe quedar visualmente justo debajo de fila 1, sin elementos
 *     intermedios y con un gap pequeño (< 32px) entre el bottom de la fila 1
 *     y el top de la fila 2.
 */
import { test, expect, type Page } from '@playwright/test';

type Source = 'archivos' | 'web' | 'imagenes';

const SOURCES: Source[] = ['archivos', 'web', 'imagenes'];

async function openImportPanel(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Dispara el mismo evento global que usa la welcome card / CTA de upload.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('vandits:open-upload'));
  });
  // El panel se monta con data-import-sources="v4".
  await page.waitForSelector('[data-import-sources="v4"]', {
    state: 'visible',
    timeout: 15_000,
  });
}

async function activateSource(page: Page, source: Source): Promise<void> {
  // Click en la pestaña de la fuente. El trigger es un botón con
  // data-import-source-tab y vive en la fila 1.
  const trigger = page.locator(`[data-import-source-tab="${source}"]`).first();
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });
  await trigger.click();
  // Espera a que el content correspondiente quede activo.
  const content = page.locator(
    `[data-import-source-content="${source}"][data-state="active"]`,
  );
  await content.waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('Import panel — row-2 immediately below row-1', () => {
  test.beforeEach(async ({ page }) => {
    await openImportPanel(page);
  });

  for (const source of SOURCES) {
    test(`row-2 (subview switcher) sits directly under row-1 for source "${source}"`, async ({
      page,
    }) => {
      await activateSource(page, source);

      // Fila 1: el grupo de pestañas. Cogemos el bounding box del trigger
      // de la fuente activa (todos los triggers comparten la misma fila).
      const row1Trigger = page
        .locator(`[data-import-source-tab="${source}"]`)
        .first();
      const row2 = page
        .locator(`[data-import-source-content="${source}"][data-state="active"] [data-import-subview-row="${source}"]`)
        .first();

      await expect(row1Trigger).toBeVisible();
      await expect(row2).toBeVisible();

      const row1Box = await row1Trigger.boundingBox();
      const row2Box = await row2.boundingBox();
      expect(row1Box, 'row-1 trigger must have a layout box').not.toBeNull();
      expect(row2Box, 'row-2 switcher must have a layout box').not.toBeNull();
      if (!row1Box || !row2Box) return;

      const row1Bottom = row1Box.y + row1Box.height;
      const gap = row2Box.y - row1Bottom;

      // Row-2 debe estar por debajo de row-1 (top de row-2 > bottom de row-1)
      // con un gap razonable. Aceptamos hasta 32px de padding/separador
      // contemplado por el shell del panel.
      expect(
        gap,
        `row-2 must be below row-1 (gap ${gap.toFixed(1)}px ≥ 0)`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        gap,
        `row-2 must be IMMEDIATELY below row-1, no intermediate band (gap ${gap.toFixed(1)}px < 32px)`,
      ).toBeLessThan(32);

      // Sanity: ambos triggers de modo (action/history) existen y son
      // descendientes de la fila 2 — confirma que es el segmented control.
      const modeTriggers = row2.locator(
        `[data-import-subview-trigger][data-import-subview-source="${source}"]`,
      );
      await expect(modeTriggers).toHaveCount(2);
    });
  }
});
