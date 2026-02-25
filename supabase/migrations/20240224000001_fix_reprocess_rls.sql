-- Migration to fix re-processing permissions and logic

-- 1. Add UPDATE policy for bronze.transactions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'bronze' 
        AND tablename = 'transactions' 
        AND policyname = 'Users can update their own bronze transactions'
    ) THEN
        CREATE POLICY "Users can update their own bronze transactions"
        ON bronze.transactions FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Create RPC for atomic re-processing prep
CREATE OR REPLACE FUNCTION reprocess_user_transactions()
RETURNS void AS $$
BEGIN
    -- Clear silver transactions for current user
    DELETE FROM public.silver_transactions WHERE user_id = auth.uid();
    
    -- Reset bronze transactions to pending (include error status too)
    UPDATE bronze.transactions 
    SET status = 'pending', error_message = NULL
    WHERE user_id = auth.uid() AND status IN ('processed', 'error');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
