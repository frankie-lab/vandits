#!/usr/bin/env -S bun run
/**
 * scripts/e2e/ensure-test-fixture.ts
 *
 * Garantiza que el usuario E2E "Sandbox Agent" tiene en su catálogo al
 * menos 1 POI por cada `visualState` canónico (`enriched`, `imported`,
 * `empty`) para que las filas del popover My Catalog
 * (`MyCatalogQuickFilters`) sean realmente interactivas y la suite
 * `camera-qa.spec.ts > Selector contract — filter-*` no quede bloqueada
 * por el contrato sistémico `count===0 && !active ⇒ disabled`.
 *
 * NO TOCA producto, kernel, cámara/subset-fit ni la UI. Sólo upsertea
 * dos `locations` con IDs deterministas en el catálogo del usuario.
 *
 * Idempotente — re-ejecutar es seguro:
 *   - IDs deterministas + PostgREST `Prefer: resolution=merge-duplicates`.
 *   - Si los registros ya existen, los reafirma con los mismos valores.
 *   - Nunca borra POIs `enriched` existentes (sólo añade los faltantes).
 *
 * Auth: usa el anon key + sign-in con `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`.
 * NO requiere `SUPABASE_SERVICE_ROLE_KEY` — el upsert pasa la RLS porque
 * `owner_user_id = auth.uid()`.
 *
 * Identidad canónica (ver `mem://preferences/sandbox-user-mirror`):
 *   email: sandbox-agent@vandits.test
 *   uid:   f04b3b95-7308-4b74-b3c7-7e819767c5fb
 *
 * Fixture IDs (estables, reservados para infraestructura E2E):
 *   document: f04b3b95-7308-4b74-b3c7-e2ed00000001
 *   imported: f04b3b95-7308-4b74-b3c7-e2e000000001
 *   empty:    f04b3b95-7308-4b74-b3c7-e2e000000002
 *
 * IMPORTANTE: los POIs DEBEN tener `document_id` apuntando al documento
 * fixture. El popover My Catalog calcula sus counts vía `getAllLocations()`
 * que SOLO recorre `documents[].locations` en el store del cliente. POIs
 * huérfanos (document_id=NULL) entran por `detachedVisibleLocations` y no
 * son visibles para los counts → la fila quedaría disabled aunque el POI
 * exista en DB.
 * Ver `docs/qa/e2e-camera-qa.md`.
 *
 * Coordenadas estables (centro de Madrid, suficientemente distinguibles
 * para no colisionar con datos reales del usuario):
 *   imported: 40.41680, -3.70380
 *   empty:    40.41700, -3.70400
 *
 * Uso local:
 *   export VITE_SUPABASE_URL="https://nolmcafkzqwfmpleyfkx.supabase.co"
 *   export VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
 *   export E2E_USER_EMAIL="sandbox-agent@vandits.test"
 *   export E2E_USER_PASSWORD="..."
 *   bun scripts/e2e/ensure-test-fixture.ts
 *
 * Uso en CI: invocado por `.github/workflows/e2e.yml` antes de
 * `npx playwright test`. Si falla, aborta el job con razón clara.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL ?? 'sandbox-agent@vandits.test';
const PASSWORD = process.env.E2E_USER_PASSWORD;
const CANONICAL_UID = 'f04b3b95-7308-4b74-b3c7-7e819767c5fb';

const FIXTURE_DOC_ID = 'f04b3b95-7308-4b74-b3c7-e2ed00000001';
const FIXTURE_DOC_NAME = 'E2E Fixture Document';

const FIXTURE = {
  imported: {
    id: 'f04b3b95-7308-4b74-b3c7-e2e000000001',
    name: 'E2E Fixture — Imported POI',
    description:
      'POI fixture for E2E camera-qa suite. Visual state = imported ' +
      '(has description but no AI enrichment). Do not delete.',
    enriched_data: null as null,
    latitude: 40.4168,
    longitude: -3.7038,
  },
  empty: {
    id: 'f04b3b95-7308-4b74-b3c7-e2e000000002',
    name: 'E2E Fixture — Empty POI',
    description: null as null,
    enriched_data: null as null,
    latitude: 40.417,
    longitude: -3.704,
  },
} as const;

function fail(msg: string): never {
  console.error(`[ensure-test-fixture] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Falta VITE_SUPABASE_URL (o SUPABASE_URL).');
if (!ANON_KEY) fail('Falta VITE_SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY).');
if (!EMAIL) fail('Falta E2E_USER_EMAIL.');
if (!PASSWORD) fail('Falta E2E_USER_PASSWORD.');

async function signIn(): Promise<{ accessToken: string; uid: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: ANON_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign-in ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    access_token?: string;
    user?: { id: string };
  };
  if (!body.access_token || !body.user?.id) {
    throw new Error('sign-in OK pero sin access_token / user.id');
  }
  return { accessToken: body.access_token, uid: body.user.id };
}

async function upsertFixtureDocument(
  accessToken: string,
  uid: string,
): Promise<'inserted' | 'updated'> {
  const head = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${FIXTURE_DOC_ID}&select=id`,
    {
      headers: {
        apikey: ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const existed = head.ok && (await head.json()).length > 0;

  const row = {
    id: FIXTURE_DOC_ID,
    user_id: uid,
    name: FIXTURE_DOC_NAME,
    source_type: 'manual',
    status: 'published',
    import_status: 'confirmed',
    total_waypoints: 2,
    resolved_count: 2,
    pending_count: 0,
    conflict_count: 0,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(
      `upsert document ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  return existed ? 'updated' : 'inserted';
}

async function upsertFixture(
  accessToken: string,
  uid: string,
  bucket: 'imported' | 'empty',
): Promise<'inserted' | 'updated'> {
  const f = FIXTURE[bucket];
  const row = {
    id: f.id,
    name: f.name,
    description: f.description,
    enriched_data: f.enriched_data,
    latitude: f.latitude,
    longitude: f.longitude,
    is_approved: true,
    owner_user_id: uid,
    visibility: 'private',
    // CRÍTICO: adjuntar al documento fixture para que el POI entre en
    // `documents[].locations` del store y por tanto en `getAllLocations()`
    // que alimenta los counts del popover My Catalog. Sin esto, el POI
    // queda como orphan (detached) y la fila aparece como disabled.
    document_id: FIXTURE_DOC_ID,
  };

  // Detecta pre-existencia para reporte (no afecta idempotencia: el
  // upsert con merge-duplicates funciona en ambos casos).
  const head = await fetch(
    `${SUPABASE_URL}/rest/v1/locations?id=eq.${f.id}&select=id`,
    {
      headers: {
        apikey: ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const existed = head.ok && (await head.json()).length > 0;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/locations`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(
      `upsert ${bucket} ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  return existed ? 'updated' : 'inserted';
}

async function main() {
  console.log(`[ensure-test-fixture] Sign-in como ${EMAIL} ...`);
  const { accessToken, uid } = await signIn();
  if (uid !== CANONICAL_UID) {
    console.warn(
      `[ensure-test-fixture] WARNING: uid devuelto (${uid}) ` +
        `!= canónico (${CANONICAL_UID}). Continúo (el upsert sigue siendo ` +
        'idempotente para ESTE usuario).',
    );
  }

  const docAction = await upsertFixtureDocument(accessToken, uid);
  console.log(
    `[ensure-test-fixture] document: ${docAction} (id=${FIXTURE_DOC_ID})`,
  );

  for (const bucket of ['imported', 'empty'] as const) {
    const action = await upsertFixture(accessToken, uid, bucket);
    console.log(
      `[ensure-test-fixture] ${bucket}: ${action} (id=${FIXTURE[bucket].id}, document_id=${FIXTURE_DOC_ID})`,
    );
  }
  console.log('[ensure-test-fixture] OK — fixture garantizado.');
}

main().catch((err) => fail((err as Error).message));
