// Pure classifier for enrich-location responses. Used by the orchestrator
// to map a dispatch result to a batch-item outcome WITHOUT trusting the
// `success` field alone.
//
// Contract:
//   - HTTP not ok            -> fail (http_<status>:<detail>)
//   - body.success === false -> skip (defense_<reason> | defense_other:<reason>)
//   - body.success === true && body.data missing -> fail (no_data_in_response)
//   - body.success === true && body.data ok      -> needs_persist  (caller
//                                                  performs RPC + verify)

export const DEFENSE_SKIP_REASONS = new Set<string>([
  "identity_root_skip",
  "identity_root_revalidation_failed",
  "invalid_coordinates",
  "reverse_geocode_failed",
  "identity_lookup_unavailable",
  "name_coordinate_mismatch",
  "name_found_elsewhere",
  "geo_narrative_mismatch",
  "llm_unverifiable",
]);

export type DispatchVerdict =
  | { kind: "fail"; reason: string }
  | { kind: "skip"; reason: string }
  | { kind: "needs_persist"; data: Record<string, unknown> };

export function classifyDispatch(
  httpOk: boolean,
  httpStatus: number,
  body: any,
): DispatchVerdict {
  if (!httpOk) {
    const detail = body?.error ?? body?.reason ?? "no_detail";
    return { kind: "fail", reason: `http_${httpStatus}:${detail}` };
  }
  if (body?.success === false) {
    const r = String(body?.reason ?? body?.skipReason ?? "unspecified");
    return {
      kind: "skip",
      reason: DEFENSE_SKIP_REASONS.has(r) ? `defense_${r}` : `defense_other:${r}`,
    };
  }
  if (!body?.data || typeof body.data !== "object") {
    return { kind: "fail", reason: "no_data_in_response" };
  }
  return { kind: "needs_persist", data: body.data };
}

/**
 * Verify whether a persisted row counts as a real success.
 * Both conditions are mandatory: descripcion must exist AND updated_at
 * must have advanced past the baseline. Otherwise the orchestrator must
 * mark the item as `fail:success_without_persist:<sub_reason>`.
 */
export function verifyPersistence(
  row: { descripcion_present?: boolean; updated_at?: string | null } | null | undefined,
  baselineUpdatedAt: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!row) return { ok: false, reason: "success_without_persist:no_row" };
  if (!row.descripcion_present) {
    return { ok: false, reason: "success_without_persist:no_descripcion" };
  }
  if (!row.updated_at) return { ok: false, reason: "success_without_persist:no_updated_at" };
  if (baselineUpdatedAt && Date.parse(row.updated_at) <= Date.parse(baselineUpdatedAt)) {
    return { ok: false, reason: "success_without_persist:updated_at_not_advanced" };
  }
  return { ok: true };
}
