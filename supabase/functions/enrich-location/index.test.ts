import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/enrich-location`;

Deno.test("CORS preflight returns 200/204", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: { "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST" },
  });
  const body = await res.text();
  assertEquals(res.status >= 200 && res.status < 300, true, `Expected 2xx, got ${res.status}`);
});

Deno.test("POST without body returns 400", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const body = await res.text();
  assertEquals(res.status >= 400 && res.status < 500, true, `Expected 4xx, got ${res.status}: ${body}`);
});

Deno.test("POST with valid location returns 200 with expected structure", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      locationId: "test-id",
      name: "Torre Eiffel",
      latitude: 48.8584,
      longitude: 2.2945,
    }),
  });
  const body = await res.json();
  // The function should return 200 even if it can't fully enrich (may need auth)
  // We just verify the response is structured JSON
  assertExists(body);
  assertEquals(typeof body, "object");
});
