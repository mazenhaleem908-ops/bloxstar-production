import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/auth/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false });
        }

        const token = String(body["token"] ?? "").trim();
        if (!token) return json({ ok: false });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("auth_sessions")
          .select("email, admin, expires_at")
          .eq("token", token)
          .maybeSingle();

        if (!row) return json({ ok: false });
        if (new Date(row.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("auth_sessions").delete().eq("token", token);
          return json({ ok: false });
        }

        return json({ ok: true, email: row.email, admin: row.admin });
      },
    },
  },
});
