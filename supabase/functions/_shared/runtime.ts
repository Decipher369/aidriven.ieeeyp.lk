import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/registration/database.ts";
export function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
// Supabase supplies this key to the Edge Function runtime automatically.
// It is never accepted from a request and never sent to the frontend.
export function service() {
  return createClient<Database>(
    secret("SUPABASE_URL"),
    secret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function response(body: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(origin
        ? {
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
            "Access-Control-Allow-Headers":
              "authorization,apikey,content-type,x-client-info",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          }
        : {}),
    },
  });
}
export function cors(request: Request) {
  const expected = new URL(secret("SITE_URL")).origin;
  const origin = request.headers.get("origin");
  if (origin !== expected)
    return {
      origin: undefined,
      rejection: response({ error: "Origin not allowed" }, 403),
    };
  if (request.method === "OPTIONS")
    return {
      origin: expected,
      rejection: new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": expected,
          Vary: "Origin",
          "Access-Control-Allow-Headers":
            "authorization,apikey,content-type,x-client-info",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      }),
    };
  return { origin: expected, rejection: null };
}
export async function validWorker(request: Request) {
  const supplied = request.headers.get("x-email-webhook-secret") ?? "";
  const expected = secret("EMAIL_WEBHOOK_SECRET");
  const hash = async (text: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    );
  const [a, b] = await Promise.all([hash(supplied), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0 && supplied.length > 0;
}
