CREATE TABLE public.auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_codes_email_idx ON public.auth_codes (email);
GRANT ALL ON public.auth_codes TO service_role;
ALTER TABLE public.auth_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.auth_sessions (
  token text PRIMARY KEY,
  email text NOT NULL,
  admin boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_email_idx ON public.auth_sessions (email);
GRANT ALL ON public.auth_sessions TO service_role;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;