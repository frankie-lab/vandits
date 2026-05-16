Update `docs/popups/p-popup-3a-validation.md` to reflect ratification while keeping the rollback path documented.

## Changes

**Header (L3):**
- `Status: **IMPLEMENTED — pending preview ratification**.` → `Status: **RATIFIED — rollout global default ON**.`
- Add ratification date line.

**§3 Flag y rollback:**
- Keep the section intact (default ON, runtime kill-switch, 1-line code rollback). Add a note that this remains the supported rollback path post-ratification, conforme `rollout-policy.md` (kill-switch global = rollback/debug, no segmentación).

**§5 Checklist:**
- Mark all items as ratified (`- [x]`) in preview against own enriched POIs.

**§6 Validation log:**
- Replace "_Pendiente_" with a ratification entry: vitest popup-relevantes (48/48) verdes + checklist §5 validado en preview; kill-switch global probado y rollback verificado.

**§7 Decisiones abiertas:**
- Retirada del badge dev `P-POPUP-3 ON`: marcar como pendiente de cleanup en próxima iteración (no bloqueante).
- Fallback `Tuyo` queda archivado (no necesario tras QA).

## Out of scope
- No code changes.
- No changes to flag default, kill-switch, or fallback branches.
- No changes to `p-popup-3-ownership-cleanup-plan.md` or governance docs.