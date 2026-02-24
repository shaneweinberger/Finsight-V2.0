-- Create Bronze Schema for raw data
CREATE SCHEMA IF NOT EXISTS bronze;

-- Grant usage on bronze schema to authenticated users (so they can insert via API/Functions)
GRANT USAGE ON SCHEMA bronze TO authenticated, service_role;

-- 1. Bronze Layer: Raw Transactions
CREATE TABLE IF NOT EXISTS bronze.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_id UUID, -- distinct ID for each uploaded file for tracking
    transaction_type TEXT, -- 'credit' or 'debit'
    raw_data JSONB NOT NULL, -- The entire row from CSV as JSON
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Configuration Tables (Public Schema)

-- A. Global LLM Prompts (System-wide or User-specific overrides can be added later)
CREATE TABLE IF NOT EXISTS public.llm_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- e.g., 'transaction_categorization_v1'
    prompt_text TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. User Categories
CREATE TABLE IF NOT EXISTS public.user_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_system_default BOOLEAN DEFAULT false, -- If true, applies to all? For now assume strict user isolation or copy-on-user-creation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- C. User Rules
CREATE TABLE IF NOT EXISTS public.user_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL, -- e.g., { "field": "description", "operator": "contains", "value": "Uber" }
    actions JSONB NOT NULL, -- e.g., { "category": "Transport", "description": "Uber Ride" }
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Silver Layer: Processed Transactions (Source of Truth)
CREATE TABLE IF NOT EXISTS public.silver_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bronze_id UUID REFERENCES bronze.transactions(id) ON DELETE SET NULL, -- Link back to source
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Normalized Fields
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT,
    transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit', 'transfer', 'income', 'payment')),
    
    -- Metadata
    is_edited BOOLEAN DEFAULT false, -- True if user manually overrode LLM result
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bronze_user_status ON bronze.transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_silver_user_date ON silver_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_silver_category ON silver_transactions(user_id, category);

-- 4. Row Level Security (RLS)

-- Enable RLS
ALTER TABLE bronze.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silver_transactions ENABLE ROW LEVEL SECURITY;

-- Policies

-- Bronze: Users can CRUD their own raw transactions
CREATE POLICY "Users can insert their own bronze transactions"
ON bronze.transactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own bronze transactions"
ON bronze.transactions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bronze transactions"
ON bronze.transactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);


-- LLM Prompts: Everyone can read active prompts (System wide), admins can edit. 
-- For now, allow read access to all authenticated users for active prompts.
CREATE POLICY "Authenticated users can read active system prompts"
ON public.llm_prompts FOR SELECT TO authenticated
USING (true); -- Or limit to is_active = true if strict


-- User Categories: Users manage their own
CREATE POLICY "Users can manage their own categories"
ON public.user_categories FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- User Rules: Users manage their own
CREATE POLICY "Users can manage their own rules"
ON public.user_rules FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Silver Transactions: Users manage their own
CREATE POLICY "Users can manage their own processed transactions"
ON public.silver_transactions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bronze_modtime
    BEFORE UPDATE ON bronze.transactions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_silver_modtime
    BEFORE UPDATE ON silver_transactions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
