-- Secondary categories: user-defined, manually-assigned tags that live alongside
-- the AI-assigned primary `category` (e.g. a dinner stays "Dining Out" but also
-- gets tagged "Napa Weekend" and "Summer Weekend Trips").
--
-- A transaction can carry zero, one, or many. They are intentionally NOT part of
-- the AI pipeline — the edge function never writes them.

-- ── 1. Definition table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_secondary_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

ALTER TABLE public.user_secondary_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own secondary categories" ON public.user_secondary_categories;
CREATE POLICY "Users can manage their own secondary categories"
ON public.user_secondary_categories FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ── 2. Assignment column on the silver layer ─────────────────────────────────
-- JSONB array of secondary category names, mirroring how `category` stores the
-- primary category by name rather than by FK.
ALTER TABLE public.silver_transactions
ADD COLUMN IF NOT EXISTS secondary_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill any pre-existing NULLs (column is NOT NULL going forward)
UPDATE public.silver_transactions
SET secondary_categories = '[]'::jsonb
WHERE secondary_categories IS NULL;

-- Containment index so "which transactions are tagged X" stays fast
CREATE INDEX IF NOT EXISTS idx_silver_secondary_categories
ON public.silver_transactions USING GIN (secondary_categories);

-- ── 3. Rename / delete helpers ───────────────────────────────────────────────
-- Assignments are stored by name, so renaming or deleting a definition has to
-- rewrite every transaction that references it — including rows outside the
-- date range the client currently has loaded. SECURITY INVOKER: RLS still
-- scopes these to the caller's own rows.

CREATE OR REPLACE FUNCTION public.rename_secondary_category(p_old_name TEXT, p_new_name TEXT)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE public.silver_transactions
    SET secondary_categories = (
        SELECT COALESCE(jsonb_agg(DISTINCT CASE WHEN elem = p_old_name THEN p_new_name ELSE elem END), '[]'::jsonb)
        FROM jsonb_array_elements_text(secondary_categories) AS elem
    )
    WHERE secondary_categories ? p_old_name;
$$;

CREATE OR REPLACE FUNCTION public.remove_secondary_category(p_name TEXT)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE public.silver_transactions
    SET secondary_categories = secondary_categories - p_name
    WHERE secondary_categories ? p_name;
$$;

GRANT EXECUTE ON FUNCTION public.rename_secondary_category(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_secondary_category(TEXT) TO authenticated;

-- ── 4. Refresh PostgREST schema cache ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
