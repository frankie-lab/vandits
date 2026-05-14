/**
 * Image Recovery Job — measurement contract.
 *
 * Single source of truth for ALL UI surfaces (bottom progress lane + admin
 * panel). Components MUST NOT compute percentages locally; they only read
 * from `getImageRecoveryMetrics(...)`.
 *
 * ── Unit of work ──
 * 1 POI evaluated = 1 scanned. Each scanned POI ends in EXACTLY one terminal
 * state, persisted server-side via `increment_image_recovery_progress`:
 *
 *   updated   → image found and saved into enriched_data.imagen
 *   no_image  → processed correctly, no source returned a usable image
 *   failed    → technical error (timeout, 5xx, exception, source down)
 *   skipped   → not processed by rule / cooldown / dry-run / already attempted
 *
 * Hard invariant:
 *   scanned == updated + no_image + failed + skipped
 *
 * `scanned` and `totalTarget` are the only process counters; everything
 * else is derived.
 *
 * ── Derived metrics ──
 *   progressPct             = scanned / totalTarget          (job advance)
 *   updateRatePct           = updated / scanned              (highlight result)
 *   noImageRatePct          = no_image / scanned
 *   technicalFailRatePct    = failed / scanned
 *   technicalSuccessRatePct = (updated + no_image) / scanned (technical health)
 *
 * Rules:
 * - Denominator 0 → metric = null. UI must not render `%`.
 * - totalTarget unknown (null/0) → progressPct = null.
 * - skipped is reported but does NOT enter success/update rates; it
 *   represents POIs the job did not attend, not outcomes.
 */

export interface ImageRecoveryJobLike {
  scanned: number;
  updated: number;
  noImage: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  totalTarget: number | null;
}

export interface ImageRecoveryMetrics {
  // Raw counts
  scanned: number;
  updated: number;
  noImage: number;
  failed: number;
  skipped: number;
  totalTarget: number | null;

  // Derived (null when denominator is 0)
  progressPct: number | null;
  updateRatePct: number | null;
  noImageRatePct: number | null;
  technicalFailRatePct: number | null;
  technicalSuccessRatePct: number | null;

  // Pre-formatted labels (one source of formatting truth)
  progressLabel: string;       // "800/1031" or "800"
  updateLabel: string;         // "797 / 800"
  noImageLabel: string;        // "2 / 800"
  failedLabel: string;         // "1 / 800"
  skippedLabel: string;        // "0"
}

function safePct(num: number, den: number | null): number | null {
  if (!den || den <= 0) return null;
  return (num / den) * 100;
}

export function getImageRecoveryMetrics(job: ImageRecoveryJobLike): ImageRecoveryMetrics {
  const scanned = Math.max(0, job.scanned ?? 0);
  const updated = Math.max(0, job.updated ?? 0);
  const noImage = Math.max(0, job.noImage ?? 0);
  const failed = Math.max(0, job.failedTransient ?? 0);
  const skipped = Math.max(0, job.skippedAlreadyAttempted ?? 0);
  const totalTarget = job.totalTarget && job.totalTarget > 0 ? job.totalTarget : null;

  return {
    scanned,
    updated,
    noImage,
    failed,
    skipped,
    totalTarget,

    progressPct: safePct(scanned, totalTarget),
    updateRatePct: safePct(updated, scanned),
    noImageRatePct: safePct(noImage, scanned),
    technicalFailRatePct: safePct(failed, scanned),
    technicalSuccessRatePct: safePct(updated + noImage, scanned),

    progressLabel: totalTarget != null ? `${scanned}/${totalTarget}` : `${scanned}`,
    updateLabel: `${updated} / ${scanned}`,
    noImageLabel: `${noImage} / ${scanned}`,
    failedLabel: `${failed} / ${scanned}`,
    skippedLabel: `${skipped}`,
  };
}

/** Format a possibly-null percentage for display. Returns "—" if null. */
export function formatPct(pct: number | null, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct.toFixed(digits)}%`;
}
