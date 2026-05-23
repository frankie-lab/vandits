// Canonical pure seed filter shared by CLI + edge bridge.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.

import {
  classifyPoiIdentityRootStatus,
  SANDBOX_OWNER_UID,
  type LocationRow,
} from "../poi-identity-root-status.ts";
import { TERRITORIAL_CANON } from "../territorial-canon.ts";

export const NOMINAL_EXCLUSIONS = [
  "Tolar Grande",
  "Eisriesenwelt",
  "Burg Hochosterwitz",
  "Mattsee",
];

export interface CandidateBucket {
  eligibleIds: string[];
  rejected: { id: string; reason: string }[];
}

export function buildSeedCandidates(rows: LocationRow[]): CandidateBucket {
  const eligibleIds: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    if (row.owner_user_id === SANDBOX_OWNER_UID) {
      rejected.push({ id, reason: "sandbox_fixture" });
      continue;
    }
    if (NOMINAL_EXCLUSIONS.includes(String(row.name ?? ""))) {
      rejected.push({ id, reason: "nominal_exclusion" });
      continue;
    }
    const verdict = classifyPoiIdentityRootStatus(row);
    if (verdict.root !== "D" || !verdict.eligibleForAutoEnrich) {
      rejected.push({
        id,
        reason: verdict.skipReason ?? `root_${verdict.root.toLowerCase()}`,
      });
      continue;
    }
    eligibleIds.push(id);
  }
  return { eligibleIds, rejected };
}

export function canonCountryCodes(): string[] {
  return Object.keys(TERRITORIAL_CANON);
}

export type { LocationRow };
