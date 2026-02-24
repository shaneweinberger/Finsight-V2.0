-- Add file_name column to bronze.transactions
ALTER TABLE bronze.transactions ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Update existing processed records if needed (optional)
-- UPDATE bronze.transactions SET file_name = 'Unknown' WHERE file_name IS NULL;
