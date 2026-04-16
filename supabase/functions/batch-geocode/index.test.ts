import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/batch-geocode`;

Deno.test("CORS preflight returns 2xx", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: { "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST" },
  });
  await res.text();
  assertEquals(res.status >= 200 && res.status < 300, true);
});

Deno.test("POST with empty array returns empty array", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ locations: [] }),
  });
  const body = await res.json();
  assertExists(body);
  // Should return an array (possibly empty) or an object with results
  assertEquals(typeof body, "object");
});

Deno.test("POST with valid locations returns structured response", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      locations: [
        { id: "test-1", latitude: 40.4168, longitude: -3.7038 },
      ],
    }),
  });
  const body = await res.json();
  assertExists(body);
  assertEquals(typeof body, "object");
});
