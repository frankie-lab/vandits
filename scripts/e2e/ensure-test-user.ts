#!/usr/bin/env -S bun run
/**
 * scripts/e2e/ensure-test-user.ts
 *
 * Asegura que el usuario de test E2E "Sandbox Agent" existe en Lovable
 * Cloud (Supabase Auth) con un password conocido. Idempotente:
 *
 *   - Si el usuario no existe → lo crea con email_confirm=true.
 *   - Si ya existe → resetea su password al valor de E2E_USER_PASSWORD.
 *   - No toca user_roles, profiles, ni ningún otro dato del proyecto.
 *
 * Identidad canónica (ver mem://preferences/sandbox-user-mirror):
 *   email: sandbox-agent@vandits.test
 *   uid:   f04b3b95-7308-4b74-b3c7-7e819767c5fb
 *
 * IMPORTANTE: requiere la SERVICE ROLE KEY del proyecto (NO la anon).
 * NUNCA commitear este valor. Obténlo desde el panel de Lovable Cloud
 * (Connectors → Lovable Cloud → API keys → service_role).
 *
 * Uso local:
 *   export SUPABASE_URL="https://nolmcafkzqwfmpleyfkx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # service_role
 *   export E2E_USER_EMAIL="sandbox-agent@vandits.test"   # opcional, este es el default
 *   export E2E_USER_PASSWORD="ElPasswordQueQuieras123!"
 *   bun scripts/e2e/ensure-test-user.ts
 *
 * Tras ejecutarlo, exporta E2E_USER_EMAIL / E2E_USER_PASSWORD con los
 * mismos valores y corre Playwright (ver docs/qa/e2e-camera-qa.md).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.E2E_USER_EMAIL ?? 'sandbox-agent@vandits.test';
const PASSWORD = process.env.E2E_USER_PASSWORD;
const CANONICAL_UID = 'f04b3b95-7308-4b74-b3c7-7e819767c5fb';

function fail(msg: string): never {
  console.error(`[ensure-test-user] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Falta SUPABASE_URL (o VITE_SUPABASE_URL).');
if (!SERVICE_ROLE_KEY) {
  fail(
    'Falta SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Obtén el service_role key en: Lovable Cloud → API keys → service_role.\n' +
      'NUNCA lo commitees ni lo metas en secrets de GitHub Actions sin necesidad.',
  );
}
if (!PASSWORD) {
  fail(
    'Falta E2E_USER_PASSWORD. Elige uno que cumpla la política de la app:\n' +
      '  - 8+ caracteres\n  - minúscula, mayúscula, número\n' +
      'Ejemplo: export E2E_USER_PASSWORD="SandboxAgent2026!"',
  );
}

const adminHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  // Admin REST API: GET /auth/v1/admin/users?email=...
  const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users`);
  url.searchParams.set('email', email);
  const res = await fetch(url, { headers: adminHeaders });
  if (!res.ok) {
    throw new Error(`admin list users ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  const match = body.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match ? { id: match.id } : null;
}

async function createUser(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { source: 'e2e-test-user', label: 'Sandbox Agent' },
    }),
  });
  if (!res.ok) {
    throw new Error(`admin create user ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { id?: string; user?: { id: string } };
  const id = body.id ?? body.user?.id;
  if (!id) throw new Error('admin create user: respuesta sin id');
  return id;
}

async function resetPassword(uid: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`admin update user ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  console.log(`[ensure-test-user] Comprobando ${EMAIL} ...`);
  const existing = await findUserByEmail(EMAIL);
  if (existing) {
    if (existing.id !== CANONICAL_UID) {
      console.warn(
        `[ensure-test-user] WARNING: el usuario existe con uid ${existing.id}, ` +
          `distinto del canónico ${CANONICAL_UID}. Continúo igualmente (reseteo password).`,
      );
    }
    console.log(`[ensure-test-user] Existe (uid=${existing.id}). Reseteando password ...`);
    await resetPassword(existing.id);
    console.log('[ensure-test-user] OK — password actualizado.');
  } else {
    console.log('[ensure-test-user] No existe. Creando ...');
    const uid = await createUser();
    console.log(`[ensure-test-user] OK — creado con uid=${uid}.`);
    if (uid !== CANONICAL_UID) {
      console.warn(
        `[ensure-test-user] NOTA: el uid generado (${uid}) no coincide con el canónico ` +
          `${CANONICAL_UID}. Para los e2e basta con email+password; si necesitas el uid ` +
          'canónico exacto, créalo manualmente vía SQL antes y vuelve a ejecutar este script.',
      );
    }
  }
  console.log('');
  console.log('Listo. Exporta estos valores para Playwright:');
  console.log(`  export E2E_USER_EMAIL="${EMAIL}"`);
  console.log(`  export E2E_USER_PASSWORD="${PASSWORD}"`);
}

main().catch((err) => fail((err as Error).message));
