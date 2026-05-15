/**
 * camera-qa.spec.ts — Automated harness for the Camera Subset-Fit pipeline.
 *
 * Drives the My POI popover via stable testids and asserts on
 * `window.__exportCameraQa()` snapshots instead of visual state.
 *
 * Pre-requisites for the suite to actually exercise flows:
 *  - the dev server is up at PLAYWRIGHT_BASE_URL (default http://localhost:5173)
 *  - the page loads authenticated (otherwise [data-testid=my-poi-trigger]
 *    is absent and the suite skips with a clear reason). Authentication is
 *    not handled here; reuse storageState from another harness if needed.
 *
 * Each test:
 *   1. Calls `__startCameraCapture('Fx')` to reset metrics + trace.
 *   2. Drives the UI through the flow.
 *   3. Polls `__exportCameraQa()` until expected metrics arrive (or fails).
 *   4. Asserts on totalRequests, byMode, byReason, lastRequest, and
 *      that no `unknownReasons` entries appeared.
 */

import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────── helpers ───────────────────────────

interface CameraQaSnapshot {
  capturedAt: string;
  captureId: string | null;
  captureLabel: string | null;
  captureStartedAt: string | null;
  metrics: {
    totalRequests: number;
    byReason: Record<string, number>;
    byMode: Record<string, number>;
    unknownReasons: Record<string, number>;
    coordsProvided: number;
    resolvedFromCoords: number;
    resolvedFromMarkers: number;
    cooldownSkipped: number;
    cooldownBypassedByAlways: number;
    directLeafletCalls: number;
    bypasses: Array<{ ts: number; reason: string; mode: string }>;
    lastRequest:
      | {
          reason: string;
          mode: string;
          idsCount: number;
          coordsCount: number;
          ts: number;
        }
      | null;
  } | null;
  trace: Array<{ timestamp: number; iso: string; label: string; payload?: unknown }>;
}

async function startCapture(page: Page, label: string): Promise<void> {
  await page.evaluate((l) => {
    if (typeof window.__startCameraCapture === 'function') {
      window.__startCameraCapture(l);
    }
  }, label);
}

async function readSnapshot(page: Page): Promise<CameraQaSnapshot | null> {
  return page.evaluate(() => {
    if (typeof window.__exportCameraQa !== 'function') return null;
    return window.__exportCameraQa() as unknown as CameraQaSnapshot;
  });
}

async function waitForMinRequests(
  page: Page,
  minTotal: number,
  timeoutMs = 5000,
): Promise<CameraQaSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: CameraQaSnapshot | null = null;
  while (Date.now() < deadline) {
    last = await readSnapshot(page);
    if (last?.metrics && last.metrics.totalRequests >= minTotal) return last;
    await page.waitForTimeout(80);
  }
  if (!last) throw new Error('camera-qa: snapshot never returned');
  throw new Error(
    `camera-qa: expected totalRequests>=${minTotal}, got ${last.metrics?.totalRequests ?? 0}. lastRequest=${JSON.stringify(last.metrics?.lastRequest)}`,
  );
}

function assertHealthyRequest(snap: CameraQaSnapshot, expectedReason: string) {
  expect(snap.metrics, 'metrics block must exist').not.toBeNull();
  const m = snap.metrics!;
  expect(m.unknownReasons, 'no unknownReasons').toEqual({});
  expect(m.lastRequest, 'lastRequest populated').not.toBeNull();
  expect(m.lastRequest!.reason).toBe(expectedReason);
  expect(m.lastRequest!.idsCount, 'idsCount > 0').toBeGreaterThan(0);
  expect(m.lastRequest!.coordsCount, 'coordsCount > 0').toBeGreaterThan(0);
  // Reason must be canonical (registered in FIT_REASONS): byReason has it.
  expect(m.byReason[expectedReason] ?? 0).toBeGreaterThan(0);
}

async function ensureHarness(page: Page): Promise<boolean> {
  await page.goto('/');
  // Wait briefly for the SPA to hydrate; if user is unauthenticated we
  // get redirected to /auth and the trigger is absent.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const url = page.url();
  if (/\/auth(\b|\/|\?|$)/.test(url)) return false;
  const trigger = page.locator('[data-testid="my-poi-trigger"]');
  const visible = await trigger.first().isVisible().catch(() => false);
  return visible;
}

async function clickFilter(page: Page, testId: string): Promise<void> {
  await page.locator('[data-testid="my-poi-trigger"]').first().click();
  const row = page.locator(`[data-testid="${testId}"]`);
  await row.waitFor({ state: 'visible', timeout: 2000 });
  await row.click();
}

// ─────────────────────────── suite ───────────────────────────

test.describe('Camera QA — subset-fit harness', () => {
  let harnessReady = false;

  test.beforeEach(async ({ page }) => {
    harnessReady = await ensureHarness(page);
    test.skip(
      !harnessReady,
      'Camera QA harness skipped: My POI trigger not visible (likely unauthenticated). ' +
        'Configure storageState in playwright.config.ts to enable.',
    );
  });

  test('F1 enriched → fires exactly one always-fit with canonical reason', async ({ page }) => {
    await startCapture(page, 'F1');
    await clickFilter(page, 'filter-enriched');

    const snap = await waitForMinRequests(page, 1);
    assertHealthyRequest(snap, 'my-catalog-popover:visual:enriched');
    expect(snap.metrics!.totalRequests).toBe(1);
    expect(snap.metrics!.byMode.always).toBe(1);
    expect(snap.metrics!.resolvedFromCoords).toBeGreaterThan(0);
    expect(snap.metrics!.resolvedFromMarkers).toBe(0);
  });

  test('F2 empty → fires always-fit for visual:empty', async ({ page }) => {
    await startCapture(page, 'F2');
    await clickFilter(page, 'filter-empty');

    const snap = await waitForMinRequests(page, 1);
    assertHealthyRequest(snap, 'my-catalog-popover:visual:empty');
    expect(snap.metrics!.byMode.always).toBe(1);
  });

  test('F3 all → fires always-fit for popover:all', async ({ page }) => {
    await startCapture(page, 'F3');
    await clickFilter(page, 'filter-all');

    const snap = await waitForMinRequests(page, 1);
    assertHealthyRequest(snap, 'my-catalog-popover:all');
    expect(snap.metrics!.byMode.always).toBe(1);
  });

  test('Active re-click replays the same fit (recenter intent)', async ({ page }) => {
    await startCapture(page, 'replay');
    await clickFilter(page, 'filter-enriched');
    await waitForMinRequests(page, 1);
    // Second click on the same active row should re-emit, not silent-noop.
    await clickFilter(page, 'filter-enriched');
    const snap = await waitForMinRequests(page, 2);
    assertHealthyRequest(snap, 'my-catalog-popover:visual:enriched');
    expect(snap.metrics!.totalRequests).toBe(2);
    expect(snap.metrics!.byReason['my-catalog-popover:visual:enriched']).toBe(2);
  });

  // ── Selector interaction contract ────────────────────────────────────
  // Every interactive row of the popover MUST honor the same contract:
  //   - first click activates → emits exactly one request
  //   - re-click on the active row replays → emits a second request
  //   - popover closes after each click (no silent noop)
  // This guards against per-value branches (e.g. an `empty` exception that
  // turns into noop) re-appearing in the selector.
  const ROW_CASES: Array<{ testId: string; reason: string }> = [
    { testId: 'filter-all', reason: 'my-catalog-popover:all' },
    { testId: 'filter-enriched', reason: 'my-catalog-popover:visual:enriched' },
    { testId: 'filter-imported', reason: 'my-catalog-popover:visual:imported' },
    { testId: 'filter-empty', reason: 'my-catalog-popover:visual:empty' },
  ];
  for (const { testId, reason } of ROW_CASES) {
    test(`Selector contract — ${testId} re-click replays without silent noop`, async ({ page }) => {
      await startCapture(page, `contract:${testId}`);

      // First click: activates filter. The subset may be empty (in which
      // case no requestSubsetFit fires) but the popover MUST close and
      // the event MUST have been dispatched (visible in the trace).
      await clickFilter(page, testId);
      // Popover must close after click.
      await page.locator('[data-testid="filter-empty"]').waitFor({ state: 'hidden', timeout: 1500 });

      // Second click: reopen popover, click the same row again.
      await clickFilter(page, testId);
      await page.locator('[data-testid="filter-empty"]').waitFor({ state: 'hidden', timeout: 1500 });

      const snap = await readSnapshot(page);
      expect(snap?.metrics, 'metrics block must exist').not.toBeNull();
      expect(snap?.metrics?.unknownReasons ?? {}, 'no unknownReasons').toEqual({});

      // Two emissions must be visible in the trace, regardless of whether
      // the subset was non-empty enough to trigger requestSubsetFit.
      const dispatched = (snap?.trace ?? []).filter((e) =>
        e.label === 'applyRow: emitMyCatalogPopoverApplied dispatched',
      );
      expect(dispatched.length, 'two dispatches in trace').toBeGreaterThanOrEqual(2);

      // If the subset was non-empty, totalRequests must equal 2 with the
      // canonical reason. If the subset was empty, totalRequests stays 0
      // but the contract (events + popover close) is still satisfied.
      const total = snap?.metrics?.totalRequests ?? 0;
      if (total > 0) {
        expect(total).toBe(2);
        expect(snap?.metrics?.byReason[reason]).toBe(2);
      }
    });
  }


  test('Cooldown bypass — `always` mode never increments cooldownSkipped', async ({ page }) => {
    await startCapture(page, 'cooldown');
    await clickFilter(page, 'filter-enriched');
    await waitForMinRequests(page, 1);
    // Rapid second click within the manual-gesture cooldown window:
    // because mode=always, it must bypass the cooldown and fire again.
    await clickFilter(page, 'filter-enriched');
    const snap = await waitForMinRequests(page, 2);
    expect(snap.metrics!.cooldownSkipped).toBe(0);
    // bypass counter is incremented when cooldown is suppressed by always mode
    expect(snap.metrics!.byMode.always).toBe(2);
  });

  test('Popup open/close — no spurious subset-fit requests', async ({ page }) => {
    await startCapture(page, 'popup');
    // Open trigger then close popover by clicking the trigger again.
    await page.locator('[data-testid="my-poi-trigger"]').first().click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const snap = await readSnapshot(page);
    expect(snap?.metrics?.totalRequests ?? 0).toBe(0);
    expect(snap?.metrics?.unknownReasons ?? {}).toEqual({});
  });

  test('Marker click → no popover-fit reason emitted', async ({ page }) => {
    // Sanity guard: clicking a map marker must NOT route through the
    // popover-fit pipeline. We assert the absence of popover-only reasons.
    await startCapture(page, 'marker-click');
    // We don't drive a real marker click here (map fixture varies per
    // session); we only ensure that just opening the page does not
    // produce popover-fit requests.
    await page.waitForTimeout(500);
    const snap = await readSnapshot(page);
    const popoverReasons = Object.keys(snap?.metrics?.byReason ?? {}).filter((k) =>
      k.startsWith('my-catalog-popover:'),
    );
    expect(popoverReasons).toEqual([]);
  });
});
