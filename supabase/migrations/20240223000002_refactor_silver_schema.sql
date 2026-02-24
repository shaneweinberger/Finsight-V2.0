-- Refactor silver_transactions schema:
-- 1. transaction_type: 'Expenditure' or 'Income' (money direction)
-- 2. transaction_method: 'credit' or 'debit' (source file type)

-- Step 1: Drop old constraint
ALTER TABLE public.silver_transactions 
DROP CONSTRAINT IF EXISTS silver_transactions_transaction_type_check;

-- Step 2: Migrate existing data FIRST (before adding new constraint)
UPDATE public.silver_transactions 
SET transaction_type = CASE 
    WHEN amount < 0 THEN 'Expenditure'
    WHEN amount > 0 THEN 'Income'
    ELSE 'Expenditure'
END;

-- Step 3: Add new constraint (data is already clean)
ALTER TABLE public.silver_transactions 
ADD CONSTRAINT silver_transactions_transaction_type_check 
CHECK (transaction_type IN ('Expenditure', 'Income'));

-- Step 4: Add transaction_method column
ALTER TABLE public.silver_transactions 
ADD COLUMN IF NOT EXISTS transaction_method TEXT 
CHECK (transaction_method IN ('credit', 'debit'));

-- Step 5: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
