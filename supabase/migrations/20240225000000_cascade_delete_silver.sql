ALTER TABLE public.silver_transactions
DROP CONSTRAINT IF EXISTS silver_transactions_bronze_id_fkey;

ALTER TABLE public.silver_transactions
ADD CONSTRAINT silver_transactions_bronze_id_fkey
FOREIGN KEY (bronze_id) REFERENCES bronze.transactions(id)
ON DELETE CASCADE;
