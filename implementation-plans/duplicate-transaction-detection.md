# Duplicate Transaction Detection — Implementation Plan

## Summary

Add a deduplication step that runs **after** CSV parsing but **before** bronze insertion. Duplicate = matching **Date + Description + Account + Amount** against existing bronze rows from previous uploads. Multiple identical transactions *within the same upload* are **not** duplicates.

---

## Architecture Decision

Rather than bloating `handleRunAiProcessing()` with inline dedup logic, we extract it into a **dedicated utility module**: `src/utils/deduplicateTransactions.js`.

This follows the same pattern already established by `src/utils/csvParser.js` — a focused, importable utility that `Processing.jsx` orchestrates but doesn't contain.

**Pipeline flow:**
```
Processing.jsx (orchestrator)
  1. parseBankCSV(file)
  2. deduplicateTransactions(parsed, userId, account)  ← NEW
  3. INSERT survivors into bronze
  4. processTransactionsInternal()
```

**Inside deduplicateTransactions.js:**
```
  → Query bronze for date-range overlap
  → Build fingerprint counts from existing rows
  → Walk new rows, decrement counts, keep survivors
```

**Benefits:**
- **Single Responsibility**: `Processing.jsx` stays an orchestrator; dedup logic lives in its own testable module
- **Consistent with existing patterns**: mirrors `csvParser.js` utility style
- **Reusable**: if you ever add batch upload or API-based ingestion, the same dedup function works

---

## Deduplication Algorithm

The key insight: **a duplicate is only when a new upload's transaction matches a previously uploaded transaction**. Two identical rows in the *same* CSV are both legitimate.

### Count-aware fingerprinting:

```
Fingerprint = "Date|Description|Amount"
(Account is implicit — we only query bronze for the selected account)
```

**Step-by-step:**

1. **Extract date range** from the parsed CSV (min/max Date).
2. **Query bronze** for existing rows where `user_id = X`, `transaction_account = Y`, and `raw_data->>'Date'` falls in `[minDate, maxDate]`.
3. **Build a count map** from existing bronze rows: `Map<fingerprint, count>`.
   - e.g., `"2026-03-15|STARBUCKS|5.50" → 1`
4. **Walk each new CSV row in order.** For each row:
   - Compute its fingerprint.
   - If the fingerprint exists in the count map **with count > 0**: it's a duplicate → decrement the count, skip the row.
   - Otherwise: it's new → keep it.

### Why counts matter — example:

> You go to Starbucks twice on March 15 for $5.50. Upload 1 has both. Upload 2 (overlapping export) also has both.

| Bronze already has | New CSV has | Count map starts at | After processing |
|---|---|---|---|
| `"03-15\|STARBUCKS\|5.50"` × 2 | `"03-15\|STARBUCKS\|5.50"` × 2 | count = 2 | Both new rows matched → 0 inserted ✅ |

> You go to Starbucks twice on March 15. Upload 1 only had the first trip. Upload 2 has both trips.

| Bronze already has | New CSV has | Count map starts at | After processing |
|---|---|---|---|
| `"03-15\|STARBUCKS\|5.50"` × 1 | `"03-15\|STARBUCKS\|5.50"` × 2 | count = 1 | First new row matches (count → 0), second row survives → 1 inserted ✅ |

---

## Proposed Changes

### [NEW] src/utils/deduplicateTransactions.js

New utility module with a single exported function:

```js
/**
 * @param {Array<{Date, Description, Amount}>} parsedRows - Normalized CSV output
 * @param {string} userId
 * @param {string} account - The selected transaction_account
 * @param {SupabaseClient} supabase
 * @returns {Promise<{ newRows: Array, duplicateCount: number }>}
 */
export async function deduplicateTransactions(parsedRows, userId, account, supabase)
```

**Logic:**
1. Compute `minDate` / `maxDate` from `parsedRows`.
2. Query `bronze.transactions` filtered by `user_id`, `transaction_account`, and date range.
3. Build count map from existing rows.
4. Walk `parsedRows`, match against count map, return survivors and duplicate count.

---

### [MODIFY] src/components/dashboard/Processing.jsx

Minimal change — import the new utility and add a few lines to `handleRunAiProcessing()` between CSV parse and bronze insert:

```diff
+ import { deduplicateTransactions } from '../../utils/deduplicateTransactions';

  // After parseBankCSV succeeds (line ~282):
+ const { newRows: uniqueParsed, duplicateCount } = await deduplicateTransactions(
+     parsed, user.id, selectedAccount, supabase
+ );
+ if (uniqueParsed.length === 0) {
+     setStatus({ type: 'success', message: `All ${duplicateCount} transactions already exist. Nothing new to upload.` });
+     setProcessing(false); stopProcessing(); return;
+ }
+ if (duplicateCount > 0) {
+     setStatus({ type: 'info', message: `${duplicateCount} duplicate(s) skipped. Uploading ${uniqueParsed.length} new transactions…` });
+ }

  // Then use `uniqueParsed` instead of `parsed` when building the bronze payloads
```

---

## Verification Plan

### Manual Testing
1. Upload March 1–30 for "TD Chequing" → all 30 rows insert normally.
2. Upload March 15–April 15 for same account → only April 1–15 rows insert; status banner shows "X duplicates skipped."
3. Upload the exact same March 1–30 file again → 0 rows insert; message says "All N transactions already exist."
4. Upload March 15–April 15 for a **different** account → all rows insert (different account = not a duplicate).
5. Upload a CSV with two identical Starbucks rows on the same day → both insert (same-upload duplicates are allowed).
6. Upload that same CSV again → both Starbucks rows are recognized as duplicates (count-aware matching catches both).
