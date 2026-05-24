// Mirror of `src/shared/geography/zone-region-guard.ts`.
// Keep in sync. See `docs/contracts/enrichment-coord-coherence-contract.md` (R8).

function norm(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function shouldDropZone(
  zone?: string | null,
  region?: string | null,
): boolean {
  const z = norm(zone);
  const r = norm(region);
  if (!z || !r) return false;
  return z === r;
}
