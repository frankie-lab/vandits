// Deno tests for POI-Identity Root Status server-side filter.
// Run with: deno test supabase/functions/_shared/poi-identity-root-status.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyPoiIdentityRootStatus,
  LocationRow,
  SANDBOX_OWNER_UID,
} from "./poi-identity-root-status.ts";

const baseD = (over: Partial<LocationRow> = {}): LocationRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "Sagrada Familia",
  latitude: 41.4036,
  longitude: 2.1744,
  country_code: "ES",
  country_id: "country-id-es",
  region_id: "region-id-cat",
  geo_health: "ok",
  enrichment_status: null,
  is_approved: true,
  deleted_at: null,
  owner_user_id: "user-1",
  enriched_data: null,
  metadata: {},
  ...over,
});

Deno.test("D happy path passes filter", () => {
  const r = classifyPoiIdentityRootStatus(baseD());
  assertEquals(r.root, "D");
  assertEquals(r.eligibleForAutoEnrich, true);
  assertEquals(r.skipReason, undefined);
});

Deno.test("rejects A — empty name", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ name: "   " }));
  assertEquals(r.root, "A");
  assertEquals(r.eligibleForAutoEnrich, false);
  assertEquals(r.skipReason, "root_a_missing_identity");
});

Deno.test("rejects A — null island", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ latitude: 0, longitude: 0 }));
  assertEquals(r.root, "A");
  assertEquals(r.skipReason, "invalid_coordinates");
});

Deno.test("rejects A — out of range coords", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ latitude: 200, longitude: 0 }));
  assertEquals(r.root, "A");
  assertEquals(r.skipReason, "invalid_coordinates");
});

Deno.test("rejects C — broken geo_health", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ geo_health: "broken" }));
  assertEquals(r.root, "C");
  assertEquals(r.skipReason, "root_c_incoherent_identity");
});

Deno.test("rejects C — stale_name", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ geo_health: "stale_name" }));
  assertEquals(r.root, "C");
});

Deno.test("rejects C — hardError", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ geo_health: "hardError" }));
  assertEquals(r.root, "C");
  assertEquals(r.skipReason, "geo_hard_error");
});

Deno.test("rejects B — geo_health=partial", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ geo_health: "partial" }));
  assertEquals(r.root, "B");
  assertEquals(r.skipReason, "root_b_unresolved");
});

Deno.test("rejects B — country_id null", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ country_id: null }));
  assertEquals(r.root, "B");
  assertEquals(r.skipReason, "root_b_unresolved");
});

Deno.test("rejects canon_gap — country outside TERRITORIAL_CANON", () => {
  // Antarctica/XK style — pick a country guaranteed not in canon.
  const r = classifyPoiIdentityRootStatus(baseD({ country_code: "AQ" }));
  assertEquals(r.root, "B");
  assertEquals(r.skipReason, "canon_gap");
});

Deno.test("rejects already_enriched — descripcion present", () => {
  const r = classifyPoiIdentityRootStatus(
    baseD({ enriched_data: { descripcion: "Una catedral modernista..." } }),
  );
  assertEquals(r.root, "D");
  assertEquals(r.eligibleForAutoEnrich, false);
  assertEquals(r.skipReason, "already_enriched");
});

Deno.test("rejects in_progress — optimistic lock collision", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ enrichment_status: "in_progress" }));
  assertEquals(r.skipReason, "in_progress");
  assertEquals(r.eligibleForAutoEnrich, false);
});

Deno.test("rejects unresolved enrichment_status", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ enrichment_status: "unresolved" }));
  assertEquals(r.skipReason, "unresolved_flag");
});

Deno.test("rejects fixture — sandbox owner uid", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ owner_user_id: SANDBOX_OWNER_UID }));
  assertEquals(r.skipReason, "fixture");
});

Deno.test("rejects fixture — metadata.synthetic=true", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ metadata: { synthetic: true } }));
  assertEquals(r.skipReason, "fixture");
});

Deno.test("rejects fixture — name beta-chain-*", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ name: "beta-chain-007" }));
  assertEquals(r.skipReason, "fixture");
});

Deno.test("rejects under_review flag", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ metadata: { under_review: true } }));
  assertEquals(r.skipReason, "under_review");
});

Deno.test("rejects deleted POIs", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ deleted_at: "2026-01-01T00:00:00Z" }));
  assertEquals(r.skipReason, "deleted");
});

Deno.test("rejects unapproved POIs", () => {
  const r = classifyPoiIdentityRootStatus(baseD({ is_approved: false }));
  assertEquals(r.skipReason, "not_approved");
});

Deno.test("simulates enqueue→write race: state changed to in_progress between calls", () => {
  // Snapshot before: eligible D.
  const before = classifyPoiIdentityRootStatus(baseD());
  assertEquals(before.eligibleForAutoEnrich, true);
  // Just before write, lock was grabbed by another worker.
  const after = classifyPoiIdentityRootStatus(baseD({ enrichment_status: "in_progress" }));
  assertEquals(after.eligibleForAutoEnrich, false);
  assertEquals(after.skipReason, "in_progress");
});

Deno.test("simulates enqueue→write race: POI got enriched by another path", () => {
  const after = classifyPoiIdentityRootStatus(
    baseD({ enriched_data: { descripcion: "ya escrita" } }),
  );
  assertEquals(after.skipReason, "already_enriched");
});
