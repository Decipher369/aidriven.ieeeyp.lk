import { z } from "zod";
import { cors, response, secret, service } from "../_shared/runtime.ts";
const input = z
  .object({
    full_name: z.string().trim().min(2).max(150),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(7).max(30),
    institution: z.string().trim().min(2).max(200),
    captcha_token: z.string().min(1).max(4096),
  })
  .strict();
const generic = {
  message:
    "If registration is available for this email, you will receive a setup link shortly.",
};
Deno.serve(async (request) => {
  let origin: string | undefined;
  try {
    const check = cors(request);
    origin = check.origin;
    if (check.rejection) return check.rejection;
    if (request.method !== "POST")
      return response({ error: "Method not allowed" }, 405, origin);
    if (Number(request.headers.get("content-length") ?? 0) > 20000)
      return response({ error: "Request too large" }, 413, origin);
    const raw = await request.text();
    if (raw.length > 20000)
      return response({ error: "Request too large" }, 413, origin);
    const data = input.safeParse(JSON.parse(raw));
    if (!data.success)
      return response(
        { error: "Please check the registration fields." },
        400,
        origin,
      );
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const ip =
      forwarded?.at(-1) ?? request.headers.get("cf-connecting-ip") ?? "unknown";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret("EMAIL_WEBHOOK_SECRET")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(ip),
    );
    const hash = Array.from(new Uint8Array(signature), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const client = service();
    const limit = await client.rpc("registration_rate_limit", {
      p_ip_hash: hash,
    });
    if (limit.error) throw limit.error;
    if (!limit.data)
      return response(
        { error: "Too many attempts. Please try again later." },
        429,
        origin,
      );
    const captcha = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret: secret("TURNSTILE_SECRET"),
          response: data.data.captcha_token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const verification = z
      .object({ success: z.boolean(), hostname: z.string().optional() })
      .parse(await captcha.json());
    if (
      !verification.success ||
      verification.hostname !== new URL(secret("SITE_URL")).hostname
    )
      return response(
        { error: "Please complete verification again." },
        400,
        origin,
      );
    const { full_name, email, phone, institution } = data.data;
    const invited = await client.auth.admin.inviteUserByEmail(email, {
      data: { full_name, phone, institution },
      redirectTo: secret("SITE_URL").replace(/\/$/, "") + "/set-password",
    });
    if (invited.error) {
      const existing = /already|registered|exists/i.test(invited.error.message);
      if (!existing) {
        console.error("Delegate invitation unavailable", {
          status: invited.error.status,
          code: invited.error.code,
        });
        return response(
          {
            error:
              "Registration is temporarily unavailable. Please try again later.",
          },
          503,
          origin,
        );
      }
    }
    return response(generic, 200, origin);
  } catch {
    console.error("Registration request failed");
    return response(
      {
        error:
          "Registration is temporarily unavailable. Please try again later.",
      },
      503,
      origin,
    );
  }
});
