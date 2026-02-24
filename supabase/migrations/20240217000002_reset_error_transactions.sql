
-- Reset failed transactions to pending so they can be re-processed
UPDATE bronze.transactions 
SET status = 'pending', error_message = NULL 
WHERE status = 'error';
