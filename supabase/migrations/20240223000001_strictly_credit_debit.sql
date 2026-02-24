-- Clean up transaction_type constraint to only allow credit and debit
-- as per clarified requirements.

ALTER TABLE public.silver_transactions 
DROP CONSTRAINT IF EXISTS silver_transactions_transaction_type_check;

ALTER TABLE public.silver_transactions 
ADD CONSTRAINT silver_transactions_transaction_type_check 
CHECK (transaction_type IN ('credit', 'debit'));
