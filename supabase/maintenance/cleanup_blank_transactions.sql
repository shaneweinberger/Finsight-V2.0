-- ============================================================================
-- One-off cleanup: remove blank "padding" transactions ingested before the
-- CSV validation fix.
--
-- BACKGROUND
-- Chase debit CSV exports pad the file with ~18 trailing ",,,," rows plus a
-- bare balance footer. PapaParse's `skipEmptyLines: true` does not drop those
-- (they are valid rows of empty strings), and the old parser turned each one
-- into a transaction dated *today* with a blank description and a $0 amount.
-- Because `transaction_type` is derived as `amount < 0 ? 'Expenditure' : 'Income'`,
-- they landed in silver as $0 **Income** rows dated the day of upload.
--
-- The parser now rejects these at ingestion. This script removes the ones
-- already in the database.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor. Run each STEP separately, in order.
-- Steps 0-2 are read-only. Nothing is deleted until STEP 3, which is commented
-- out on purpose — read STEP 2's output first and uncomment deliberately.
--
-- Take a backup first: Dashboard -> Database -> Backups.
-- ============================================================================


-- ─── STEP 0: confirm the live column names ──────────────────────────────────
-- The repo's migrations declare silver_transactions.date, but the Edge Function
-- writes transaction_date, so the live schema differs from the migration
-- history. Run this first and use whichever names come back.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'silver_transactions'
ORDER BY ordinal_position;


-- ─── STEP 1: how much junk is there, and where did it come from? ────────────
-- Identification is keyed on bronze.raw_data, the immutable source record,
-- rather than on the AI-assigned description in silver. This matches exactly
-- what the new parser's isUsableTransaction() rejects: blank description AND
-- a zero/absent amount.

SELECT
    b.file_name,
    b.transaction_account,
    b.status,
    COUNT(*) AS junk_rows,
    MIN(b.created_at)::date AS first_uploaded,
    MAX(b.created_at)::date AS last_uploaded
FROM bronze.transactions b
WHERE COALESCE(TRIM(b.raw_data->>'Description'), '') = ''
  AND COALESCE(TRIM(b.raw_data->>'Amount'), '0') IN ('0', '0.0', '0.00', '')
GROUP BY b.file_name, b.transaction_account, b.status
ORDER BY last_uploaded DESC;


-- ─── STEP 2: preview the exact rows that STEP 3 would delete ────────────────
-- IMPORTANT: `is_edited = true` means you manually corrected that row in the
-- UI. Those are excluded from deletion below — if you renamed a blank row into
-- a real transaction, it is kept. This query lists them separately so you can
-- see whether any exist.

-- 2a. Rows that WILL be deleted
SELECT
    b.id            AS bronze_id,
    b.file_name,
    b.created_at::date AS uploaded,
    s.id            AS silver_id,
    s.description   AS silver_description,
    s.category,
    s.amount,
    s.transaction_type
FROM bronze.transactions b
LEFT JOIN public.silver_transactions s ON s.bronze_id = b.id
WHERE COALESCE(TRIM(b.raw_data->>'Description'), '') = ''
  AND COALESCE(TRIM(b.raw_data->>'Amount'), '0') IN ('0', '0.0', '0.00', '')
  AND COALESCE(s.is_edited, false) = false
ORDER BY b.created_at DESC, b.id;

-- 2b. Blank-origin rows you have since EDITED — these are KEPT. Review them.
--     If any are genuinely junk, delete them by id by hand.
SELECT
    s.id, s.description, s.category, s.amount, s.is_edited, b.file_name
FROM bronze.transactions b
JOIN public.silver_transactions s ON s.bronze_id = b.id
WHERE COALESCE(TRIM(b.raw_data->>'Description'), '') = ''
  AND COALESCE(TRIM(b.raw_data->>'Amount'), '0') IN ('0', '0.0', '0.00', '')
  AND s.is_edited = true;

-- 2c. Orphaned junk in silver whose bronze parent is already gone.
--     Before migration 20240225000000, the FK was ON DELETE SET NULL, so
--     deleting a bronze row left the silver row behind with bronze_id = NULL.
--     Signature: blank/whitespace description AND exactly $0.
--     A $0 row WITH a real description is legitimate (refund adjustments) and
--     is not matched here.
SELECT id, description, category, amount, transaction_type, processed_at::date
FROM public.silver_transactions
WHERE bronze_id IS NULL
  AND COALESCE(TRIM(description), '') = ''
  AND amount = 0
  AND COALESCE(is_edited, false) = false
ORDER BY processed_at DESC;


-- ============================================================================
-- ─── STEP 3: THE DELETES ────────────────────────────────────────────────────
-- Destructive. Uncomment only after reviewing STEP 2.
--
-- Wrapped in a transaction with a ROLLBACK at the end so a first run shows you
-- the affected row counts WITHOUT committing. When the numbers match STEP 2,
-- change ROLLBACK to COMMIT and run again.
--
-- Deleting from bronze cascades to silver
-- (silver_transactions_bronze_id_fkey ON DELETE CASCADE, migration 20240225000000),
-- so 3a removes both layers in one statement.
-- ============================================================================

/*
BEGIN;

-- 3a. Delete blank bronze rows (cascades to their silver children)
DELETE FROM bronze.transactions b
WHERE COALESCE(TRIM(b.raw_data->>'Description'), '') = ''
  AND COALESCE(TRIM(b.raw_data->>'Amount'), '0') IN ('0', '0.0', '0.00', '')
  AND NOT EXISTS (
      SELECT 1 FROM public.silver_transactions s
      WHERE s.bronze_id = b.id AND s.is_edited = true
  );

-- 3b. Delete orphaned junk silver rows (bronze parent already gone)
DELETE FROM public.silver_transactions
WHERE bronze_id IS NULL
  AND COALESCE(TRIM(description), '') = ''
  AND amount = 0
  AND COALESCE(is_edited, false) = false;

-- Inspect the reported row counts above.
-- Then: change ROLLBACK -> COMMIT and re-run.
ROLLBACK;
-- COMMIT;
*/


-- ─── STEP 4: verify ─────────────────────────────────────────────────────────
-- Both counts should be 0 (or equal to the is_edited rows you chose to keep).

SELECT
    (SELECT COUNT(*) FROM bronze.transactions b
      WHERE COALESCE(TRIM(b.raw_data->>'Description'), '') = ''
        AND COALESCE(TRIM(b.raw_data->>'Amount'), '0') IN ('0','0.0','0.00','')
    ) AS remaining_blank_bronze,
    (SELECT COUNT(*) FROM public.silver_transactions
      WHERE COALESCE(TRIM(description), '') = '' AND amount = 0
    ) AS remaining_blank_silver;

-- Sanity check: your real data should be untouched. For the May 26 - Jul 27
-- debit file this should return 17 rows totalling -15040.64.
-- NOTE: swap `transaction_date` for whatever STEP 0 reported as the date column.
SELECT COUNT(*) AS rows, SUM(amount) AS total
FROM public.silver_transactions
WHERE transaction_account = '<your debit account name>'
  AND transaction_date BETWEEN '2026-05-26' AND '2026-07-27';
