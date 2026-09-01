import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ADMIN_EMAILS = [
  "mazenhaleem908@gmail.com",
  "kareemahmedhalim@gmail.com",
  "sagedhalim9@gmail.com",
];

export const Route = createFileRoute("/api/public/auth/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "invalid" }, 400);
        }

        const email = String(body["email"] ?? "")
          .trim()
          .toLowerCase();
        const code = String(body["code"] ?? "").trim();
        if (!email || !/^\d{4,8}$/.test(code)) return json({ ok: false, error: "invalid" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("auth_codes")
          .select("id, code, expires_at, attempts")
          .eq("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!row) return json({ ok: false, error: "expired" }, 400);
        if (new Date(row.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("auth_codes").delete().eq("id", row.id);
          return json({ ok: false, error: "expired" }, 400);
        }
        if (row.attempts >= 5) {
          await supabaseAdmin.from("auth_codes").delete().eq("id", row.id);
          return json({ ok: false, error: "expired" }, 429);
        }
        if (row.code !== code) {
          await supabaseAdmin
            .from("auth_codes")
            .update({ attempts: row.attempts + 1 })
            .eq("id", row.id);
          return json({ ok: false, error: "invalid" }, 400);
        }

        await supabaseAdmin.from("auth_codes").delete().eq("id", row.id);

        const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const admin = ADMIN_EMAILS.includes(email);
        const { error } = await supabaseAdmin.from("auth_sessions").insert({
          token,
          email,
          admin,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        });
        if (error) {
          console.error("[auth/verify-code] session insert failed", error);
          return json({ ok: false, error: "invalid" }, 500);
        }

        return json({ ok: true, token, email, admin });
      },
    },
  },
});
