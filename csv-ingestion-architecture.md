# Dynamic CSV Ingestion Architecture

The application supports uploading bank transactions from multiple institutions, each with its own proprietary CSV export format. To handle this variability without requiring users to manually map columns during upload, we utilize a **Dynamic Schema Detection** system.

## Data Flow Overview

1. **User Uploads CSV** via `Processing.jsx`
2. **Auto-Detection & Normalization** runs locally in the browser using `src/utils/csvParser.js`
3. **Standardized Insertion** to the `bronze.transactions` table in Supabase
4. **AI Processing** via the `process-transactions` Edge Function to classify the standardized data into `silver_transactions`

---

## 1. The Parser Utility (`csvParser.js`)

At the core of the ingestion pipeline is `parseBankCSV(file)`, a two-pass parser built on top of PapaParse.

### First Pass: Header Detection
The system reads only the *first row* of the uploaded CSV to determine the file's structure.
- **Headered Formats (e.g., Chase):** The first row contains column names (like "Transaction Date", "Amount"). The system verifies this by checking that *every cell* in the first row is purely alphabetic text (`isPureText`).
- **Headerless Formats (e.g., TD Bank):** The first row contains raw transaction data (e.g., a date string, numbers). If any cell contains a parseable date or number, the system identifies the file as headerless.

### Second Pass: Parsing and Standardization

#### Path A: Header-based Parsing (Chase, etc.)
If headers are detected, the CSV is parsed into JSON objects where keys are the column names. The system then maps these variant names into our canonical internal schema:
- **Date:** Mapped from `['Transaction Date', 'Date', 'Posting Date', 'Post Date']`
- **Description:** Mapped from `['Description', 'Memo', 'Merchant', 'Name']`
- **Amount:** Mapped from `['Amount', 'Transaction Amount']`

#### Path B: Headerless Mapping (TD Bank)
If no headers are present, the system defaults to a known positional index approach:
- `row[0]` -> Date
- `row[1]` -> Description
- `row[2]` & `row[3]` -> MoneyOut and MoneyIn, which are mathematically unified into a single signed `Amount`.

### Third Pass: Row Validation

Spreadsheet exports pad the file with contentless rows. Chase's **debit** activity
export ships ~18 trailing `,,,,` lines plus a bare balance footer (`,,,,9170`);
the credit export does not. These are *not* removed by PapaParse's
`skipEmptyLines: true`, which only drops lines that are literally empty — a
`,,,,` line is a valid row of empty strings.

Every mapped row is therefore run through `isUsableTransaction()` and dropped if:
- the date is unparseable, **or**
- the amount is unparseable, **or**
- the description is blank **and** the amount is 0

`parseAmount` returns `NaN` (not `0`) and `normalizeDate` returns `null` (not
today's date) for bad input, so junk rows can be *detected* rather than silently
turned into plausible-looking $0 transactions dated today.

> **Do not "simplify" this by switching the full parse to `skipEmptyLines: 'greedy'`.**
> Greedy discards padding rows inside PapaParse, so they never reach the filter
> and `skippedCount` under-reports (1 instead of 18 on a Chase debit export).
> The *preview* pass does use 'greedy', deliberately — padding above the header
> would otherwise defeat header detection and send the file down the headerless path.

### Date handling

`normalizeDate` parses `YYYY-MM-DD` and `MM/DD/YYYY` with explicit regexes rather
than `new Date(x).toISOString()`. That combination shifts the calendar day by one
depending on the local UTC offset and the input format — Chase's `MM/DD/YYYY`
dates landed a day early for every user at a positive UTC offset. Both formats
are in use across supported banks, so the calendar date is pinned explicitly.
The same helper is mirrored as `normalizeRawDate` in the Edge Function.

### Output format
Both paths converge to yield a standardized array of transaction objects:
```json
{
  "Date": "YYYY-MM-DD",
  "Description": "STARBUCKS STORE 1234",
  "Amount": -5.50
}
```

`parseBankCSV` returns `{ transactions, error, skippedCount }`, where
`skippedCount` is the number of rows rejected by validation.

---

## 2. Ingestion Flow (`Processing.jsx`)

When the user uploads a CSV and clicks "Run AI Processing", the `handleRunAiProcessing` function:
1. Calls `parseBankCSV(file)`.
2. Checks for `parseError`. If a format is completely unrecognizable, a `ParseErrorModal` informs the user.
3. If **every** row was rejected, reports how many were skipped and why, rather than the bare "No transactions found".
4. Packages the normalized objects into payloads for the `bronze.transactions` table, mapping the unified `{ Date, Description, Amount }` structure into the `raw_data` JSONB column.
5. Surfaces the count actually imported alongside any skipped rows ("Uploading 17 transactions (skipped 18 blank rows)…") so silent data loss is visible.

---

## 3. The Backend Pipeline (`process-transactions` Edge Function)

Because the frontend handles all the complexity of date normalization, column alias resolution, and debit/credit math, the backend edge function remains incredibly simple.

When invoked, the function:
1. Immediately locks pending rows by setting `status = 'processing'` to prevent race conditions from concurrent invocations.
2. Extracts the `Amount`, `Date`, and `Description` directly from the `raw_data` JSONB.
3. Maintains a legacy fallback to compute `Amount` from `MoneyOut` / `MoneyIn` for older Bronze DB rows.
4. Filters out unusable rows (`isUnusable`) as a backstop before classification. Bronze rows uploaded *before* the validation fix still carry blank descriptions, $0 amounts and fabricated dates. This matters for two reasons: classifying them wastes Gemini tokens against the user's `token_limit`, and a null `transaction_date` would violate NOT NULL on the silver insert and fail the **entire batch**. Skipped rows fall through to the existing `omittedIds` path and are retired as `processed`.
5. Bundles the clean data and sends it to the Gemini AI context window for categorization. If nothing in a user's slice is classifiable, the AI call is skipped entirely and the rows are retired directly.
6. Does a preflight DB check to ensure Bronze rows weren't deleted manually before attempting batch insertion into `silver_transactions`.

> Note: `transaction_type` is derived as `amount < 0 ? 'Expenditure' : 'Income'`, so a $0 row books as **Income**. That is another reason $0/blank rows must never reach this stage.
