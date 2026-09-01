CREATE TABLE public.orders (
  code text PRIMARY KEY,
  intent_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending_payment',
  paid boolean NOT NULL DEFAULT false,
  email text,
  roblox_user text,
  game text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX orders_email_idx ON public.orders (email);
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.item_stock (
  item_id integer PRIMARY KEY,
  qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.item_stock TO service_role;
ALTER TABLE public.item_stock ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_stock(p_items jsonb, p_default integer DEFAULT 12)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line jsonb;
  iid integer;
  need integer;
  have integer;
BEGIN
  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    iid := (line->>'id')::integer;
    need := GREATEST(1, COALESCE((line->>'q')::integer, 1));
    INSERT INTO public.item_stock(item_id, qty)
      VALUES (iid, p_default)
      ON CONFLICT (item_id) DO NOTHING;
    SELECT qty INTO have FROM public.item_stock WHERE item_id = iid FOR UPDATE;
    IF have IS NULL OR have < need THEN
      RAISE EXCEPTION 'out_of_stock:%', iid;
    END IF;
    UPDATE public.item_stock SET qty = qty - need, updated_at = now() WHERE item_id = iid;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stock(p_items jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line jsonb;
BEGIN
  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE public.item_stock
       SET qty = qty + GREATEST(1, COALESCE((line->>'q')::integer, 1)), updated_at = now()
     WHERE item_id = (line->>'id')::integer;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stock(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stock(jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stock(jsonb) TO service_role;