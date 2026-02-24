-- 1. Fix Permissions (Idempotent)
-- Ensure the schema exists
CREATE SCHEMA IF NOT EXISTS bronze;

-- Grant usage on the schema to standard Supabase roles
GRANT USAGE ON SCHEMA bronze TO anon, authenticated, service_role;

-- Grant table-level permissions to the transactions table
GRANT ALL ON TABLE bronze.transactions TO authenticated, service_role;

-- Grant usage on any sequences (for ID generation if used)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA bronze TO authenticated, service_role;

-- Ensure RLS is enabled
ALTER TABLE bronze.transactions ENABLE ROW LEVEL SECURITY;

-- 2. Seed Prompt
INSERT INTO public.llm_prompts (name, prompt_text, is_active)
VALUES (
    'transaction_categorization_v1',
    'You are an expert financial cleaner and categorizer.
    Your job is to take raw transaction descriptions and:
    1. Clean them up (remove numbers, store IDs, irrelevant codes).
    2. Categorize them into one of the provided USER CATEGORIES.
    
    CRITICAL RULES:
    - If a specific USER RULE applies, you MUST use that category.
    - If no rule applies, use your best judgment to pick from the USER CATEGORIES.
    - If unsure, use "Uncategorized".
    
    Output JSON ONLY.',
    true
)
ON CONFLICT (name) DO NOTHING;

-- 3. Function to seed categories for a user
CREATE OR REPLACE FUNCTION public.seed_user_categories(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_categories (user_id, name, is_system_default)
    VALUES
        (target_user_id, 'Groceries', true),
        (target_user_id, 'Dining Out', true),
        (target_user_id, 'Rent/Mortgage', true),
        (target_user_id, 'Utilities', true),
        (target_user_id, 'Transportation', true),
        (target_user_id, 'Entertainment', true),
        (target_user_id, 'Health & Wellness', true),
        (target_user_id, 'Shopping', true),
        (target_user_id, 'Income', true),
        (target_user_id, 'Transfers', true),
        (target_user_id, 'Other', true)
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Seed for existing users
DO $$
DECLARE
    u RECORD;
BEGIN
    FOR u IN SELECT id FROM auth.users LOOP
        PERFORM public.seed_user_categories(u.id);
    END LOOP;
END;
$$;

-- 5. Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.seed_user_categories(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid duplication errors during re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
