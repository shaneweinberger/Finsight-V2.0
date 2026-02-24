-- Fix permissions for bronze.transactions
GRANT ALL ON TABLE bronze.transactions TO authenticated;
GRANT ALL ON TABLE bronze.transactions TO service_role;

-- Ensure transaction_type column exists (in case the previous migration didn't run)
ALTER TABLE bronze.transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
