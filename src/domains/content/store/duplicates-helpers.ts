// Domain: Content — localStorage persistence helpers for duplicate detection
import { DuplicateMatch } from '@/lib/duplicate-detection';

const PENDING_DUPLICATES_KEY = 'geodata-pending-duplicates';
const RESOLVED_DUPLICATES_KEY = 'geodata-resolved-duplicates';

export function loadPendingDuplicates(): DuplicateMatch[] {
  try {
    const stored = localStorage.getItem(PENDING_DUPLICATES_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
}

export function savePendingDuplicates(duplicates: DuplicateMatch[]): void {
  try {
    localStorage.setItem(PENDING_DUPLICATES_KEY, JSON.stringify(duplicates));
  } catch (e) {
    console.error('Error saving pending duplicates:', e);
  }
}

export function loadResolvedDuplicates(): string[] {
  try {
    const stored = localStorage.getItem(RESOLVED_DUPLICATES_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
}

export function saveResolvedDuplicates(pairIds: string[]): void {
  try {
    localStorage.setItem(RESOLVED_DUPLICATES_KEY, JSON.stringify(pairIds));
  } catch (e) {
    console.error('Error saving resolved duplicates:', e);
  }
}
