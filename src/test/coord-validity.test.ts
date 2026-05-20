import { describe, it, expect } from 'vitest';
import {
  isValidWgs84Coord,
  inspectWgs84Coord,
} from '@/shared/geography/coord-validity';

describe('isValidWgs84Coord (Phase 1 — R1 entry gate)', () => {
  it('accepts a real point (Madrid)', () => {
    expect(isValidWgs84Coord(40.4168, -3.7038)).toBe(true);
  });

  it('rejects (0, 0) Null Island as the canonical "never resolved" sentinel', () => {
    expect(isValidWgs84Coord(0, 0)).toBe(false);
    expect(inspectWgs84Coord(0, 0).reason).toBe('null_island');
  });

  it('rejects sub-epsilon values around Null Island', () => {
    expect(isValidWgs84Coord(0.00000001, -0.00000005)).toBe(false);
  });

  it('accepts values close to but outside the Null Island epsilon', () => {
    expect(isValidWgs84Coord(0.001, 0)).toBe(true);
    expect(isValidWgs84Coord(0, 0.001)).toBe(true);
  });

  it('rejects out-of-WGS84 ranges', () => {
    expect(inspectWgs84Coord(91, 0).reason).toBe('out_of_range');
    expect(inspectWgs84Coord(-90.01, 0).reason).toBe('out_of_range');
    expect(inspectWgs84Coord(0, 180.5).reason).toBe('out_of_range');
    expect(inspectWgs84Coord(0, -181).reason).toBe('out_of_range');
  });

  it('rejects NaN / Infinity', () => {
    expect(inspectWgs84Coord(NaN, 0).reason).toBe('not_finite');
    expect(inspectWgs84Coord(0, Infinity).reason).toBe('not_finite');
  });

  it('rejects non-number inputs', () => {
    expect(inspectWgs84Coord(null, 0).reason).toBe('not_a_number');
    expect(inspectWgs84Coord('40', '-3').reason).toBe('not_a_number');
    expect(inspectWgs84Coord(undefined, undefined).reason).toBe('not_a_number');
  });
});
