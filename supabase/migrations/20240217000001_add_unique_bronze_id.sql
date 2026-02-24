
-- Add unique constraint to bronze_id in silver_transactions to allow upsert
ALTER TABLE silver_transactions ADD CONSTRAINT silver_transactions_bronze_id_key UNIQUE (bronze_id);
