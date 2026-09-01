import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const Route = createFileRoute("/api/public/auth/send-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "invalid_email" }, 400);
        }

        const email = String(body["email"] ?? "")
          .trim()
          .toLowerCase();
        if (!EMAIL_RE.test(email)) return json({ ok: false, error: "invalid_email" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // one code per minute, per email
        const { data: recent } = await supabaseAdmin
          .from("auth_codes")
          .select("created_at")
          .eq("email", email)
          .gt("created_at", new Date(Date.now() - 60_000).toISOString())
          .limit(1);
        if (recent && recent.length > 0) return json({ ok: false, error: "rate_limited" }, 429);

        const code = String(Math.floor(100000 + Math.random() * 900000));

        await supabaseAdmin.from("auth_codes").delete().eq("email", email);
        const { error: insertError } = await supabaseAdmin.from("auth_codes").insert({
          email,
          code,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
        if (insertError) {
          console.error("[auth/send-code] db insert failed", insertError);
          return json({ ok: false, error: "send-failed" }, 500);
        }

        const apiKey = process.env["RESEND_API_KEY"];
        if (!apiKey) {
          console.error("[auth/send-code] RESEND_API_KEY is not configured");
          return json({ ok: false, error: "email_send_failed" }, 500);
        }

        const from = String(body["from"] ?? "business@bloxistar.com");
        const fromName = String(body["fromName"] ?? "BloxStar");
        const replyTo = String(body["replyTo"] ?? from);
        const subject = String(body["subject"] ?? "Your BloxStar verification code");
        const html = body["html"]
          ? String(body["html"]).split("{{code}}").join(code)
          : `<p>Your BloxStar verification code is <b>${code}</b>. It expires in 10 minutes.</p>`;
        const text = body["text"]
          ? String(body["text"]).split("{{code}}").join(code)
          : `Your BloxStar verification code is ${code}. It expires in 10 minutes.`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${from}>`,
            to: [email],
            reply_to: replyTo,
            subject,
            html,
            text,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          console.error("[auth/send-code] resend failed", res.status, detail);
          return json({ ok: false, error: "email_send_failed" }, 502);
        }

        return json({ ok: true });
      },
    },
  },
});
