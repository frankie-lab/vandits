import { describe, it, expect } from 'vitest';
import { getImageRecoveryMetrics, formatPct } from '@/stores/image-recovery-job-metrics';

const job = (over: Partial<Parameters<typeof getImageRecoveryMetrics>[0]> = {}) => ({
  scanned: 0, updated: 0, noImage: 0, failedTransient: 0,
  skippedAlreadyAttempted: 0, totalTarget: null, ...over,
});

describe('getImageRecoveryMetrics', () => {
  it('all zero → all rates null', () => {
    const m = getImageRecoveryMetrics(job());
    expect(m.updateRatePct).toBeNull();
    expect(m.progressPct).toBeNull();
    expect(m.technicalSuccessRatePct).toBeNull();
  });

  it('canonical example: 800 scanned, 797 updated, 2 no_image, 1 failed of 1031', () => {
    const m = getImageRecoveryMetrics(job({
      scanned: 800, updated: 797, noImage: 2, failedTransient: 1, totalTarget: 1031,
    }));
    expect(m.progressPct!).toBeCloseTo(77.59, 1);
    expect(m.updateRatePct!).toBeCloseTo(99.625, 2);
    expect(m.technicalSuccessRatePct!).toBeCloseTo(99.875, 2);
    expect(m.technicalFailRatePct!).toBeCloseTo(0.125, 2);
    expect(m.progressLabel).toBe('800/1031');
  });

  it('100% no_image → update 0%, technical success 100%', () => {
    const m = getImageRecoveryMetrics(job({ scanned: 50, noImage: 50 }));
    expect(m.updateRatePct).toBe(0);
    expect(m.technicalSuccessRatePct).toBe(100);
    expect(m.technicalFailRatePct).toBe(0);
  });

  it('100% failed → technical success 0%, fail 100%', () => {
    const m = getImageRecoveryMetrics(job({ scanned: 10, failedTransient: 10 }));
    expect(m.technicalSuccessRatePct).toBe(0);
    expect(m.technicalFailRatePct).toBe(100);
  });

  it('totalTarget null → progressPct null, label without /', () => {
    const m = getImageRecoveryMetrics(job({ scanned: 10, updated: 10 }));
    expect(m.progressPct).toBeNull();
    expect(m.progressLabel).toBe('10');
  });

  it('formatPct handles null', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(99.625, 2)).toBe('99.63%');
  });
});
