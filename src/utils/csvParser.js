import Papa from 'papaparse';

// ─── Known Header Aliases ─────────────────────────────────────────────────────
// Maps common bank CSV column names to our three standardized fields.
// All aliases are lowercase for case-insensitive matching.
const DATE_ALIASES    = ['date', 'transaction date', 'trans date', 'posting date', 'post date', 'txn date'];
const DESC_ALIASES    = ['description', 'name', 'payee', 'merchant', 'memo', 'transaction description'];
const AMOUNT_ALIASES  = ['amount', 'transaction amount', 'value', 'debit/credit'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attempt to parse a value as a calendar date.
 * Returns true if the value looks like a date string (not a plain number).
 */
function looksLikeDate(value) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const str = String(value).trim();
    // Reject if the string is purely numeric (e.g. "12345") — that's an amount, not a date
    if (/^\d+(\.\d+)?$/.test(str)) return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
}

/**
 * Attempt to parse a value as a numeric amount.
 * Strips currency symbols and whitespace.
 *
 * Returns NaN for blank or unparseable input — callers MUST decide what that
 * means in context. Returning 0 here would silently turn junk rows into
 * legitimate-looking $0 transactions.
 */
function parseAmount(value) {
    if (value === null || value === undefined || String(value).trim() === '') return NaN;
    const clean = String(value).replace(/[^0-9.\-]/g, '');
    if (clean === '' || clean === '-' || clean === '.') return NaN;
    const num = parseFloat(clean);
    return isFinite(num) ? num : NaN;
}

/**
 * Normalize a date value to a YYYY-MM-DD calendar string.
 *
 * Parses the common bank formats by hand rather than deferring to `new Date()`
 * + `toISOString()`. That combination shifts the calendar day whenever the
 * local timezone offset crosses midnight in UTC: `MM/DD/YYYY` is read as local
 * midnight (shifting forward for negative offsets) while `YYYY-MM-DD` is read
 * as UTC midnight (shifting backward once converted to local). Both formats
 * appear in the banks we support, so we pin the calendar date explicitly.
 *
 * Returns null when the value cannot be parsed. Callers drop those rows —
 * inventing a date (previously "today") fabricates data.
 */
function normalizeDate(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (str === '') return null;

    const pad = (n) => String(n).padStart(2, '0');

    // Guard against impossible components surviving as a valid-looking string.
    const build = (y, m, d) => {
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        if (y < 1900 || y > 2200) return null;
        return `${y}-${pad(m)}-${pad(d)}`;
    };

    // ISO-style: YYYY-MM-DD or YYYY/MM/DD (TD exports)
    const iso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return build(+iso[1], +iso[2], +iso[3]);

    // North American: MM/DD/YYYY or MM-DD-YYYY (Chase exports)
    const na = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (na) return build(+na[3], +na[1], +na[2]);

    // Last resort: let the engine try (e.g. "Jan 5, 2026"), then read back the
    // LOCAL calendar fields so we never round-trip through UTC.
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return null;
}

/**
 * Decide whether a normalized row carries real financial signal.
 *
 * Rows are dropped when they have no usable date, no usable amount, or are
 * entirely contentless (blank description AND a zero amount). That last case
 * is what trailing spreadsheet padding (",,,,") looks like once parsed.
 */
function isUsableTransaction(tx) {
    if (tx.Date === null) return false;
    if (!isFinite(tx.Amount)) return false;
    if (tx.Description === '' && tx.Amount === 0) return false;
    return true;
}

/**
 * Search a list of header strings for one that matches any of the provided aliases.
 * Returns the original header string, or null if no match found.
 */
function findHeader(headers, aliases) {
    const lowerHeaders = headers.map(h => String(h).trim().toLowerCase());
    for (const alias of aliases) {
        const idx = lowerHeaders.indexOf(alias);
        if (idx !== -1) return headers[idx];
    }
    return null;
}

// ─── Core Detection ───────────────────────────────────────────────────────────

/**
 * Returns true if a cell value is purely text — only letters, spaces, and
 * light punctuation (slashes, hyphens, etc.). No digits at all.
 * Empty/blank cells are treated as non-text (they can't confirm a header).
 */
function isPureText(value) {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    if (str === '') return false;
    // Must not contain any digits
    if (/\d/.test(str)) return false;
    // Must start with a letter and contain only letters, spaces, and common header symbols
    return /^[a-zA-Z][a-zA-Z\s/\-_.,()#$&%[\]]*$/.test(str);
}

/**
 * Determines whether the first row of CSV data contains headers or raw data.
 *
 * Heuristic: First checks if the row contains at least two of the known standard
 * aliases (Date, Description, Amount). If so, it is treated as a header.
 * Otherwise, falls back to checking if every non-empty cell is purely text.
 */
function hasHeaders(firstRow) {
    if (!firstRow || firstRow.length === 0) return false;

    // 1. Positive indicator: Check if we can find at least two of our standard columns (Date, Description, Amount) using our aliases.
    const lowerRow = firstRow.map(cell => String(cell).trim().toLowerCase());
    const hasDate = DATE_ALIASES.some(alias => lowerRow.includes(alias));
    const hasDesc = DESC_ALIASES.some(alias => lowerRow.includes(alias));
    const hasAmount = AMOUNT_ALIASES.some(alias => lowerRow.includes(alias));
    
    const matchCount = (hasDate ? 1 : 0) + (hasDesc ? 1 : 0) + (hasAmount ? 1 : 0);
    if (matchCount >= 2) return true;

    // 2. Fallback: If EVERY non-empty cell in the first row is purely alphabetic/text, treat it as a header.
    // We filter out empty cells since trailing empty columns are common.
    const nonEmptyCells = firstRow.map(cell => String(cell).trim()).filter(cell => cell !== '');
    if (nonEmptyCells.length > 0 && nonEmptyCells.every(cell => isPureText(cell))) {
        return true;
    }

    return false;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse a HEADER-BASED CSV (e.g. Chase).
 * Uses alias matching to locate Date, Description, and Amount columns.
 *
 * @param {Object[]} rows – Array of objects keyed by header name.
 * @returns {{ transactions: Array, error: string|null }}
 */
function parseWithHeaders(rows) {
    if (rows.length === 0) return { transactions: [], error: 'CSV file is empty.', skippedCount: 0 };

    const headers = Object.keys(rows[0]);
    const dateCol   = findHeader(headers, DATE_ALIASES);
    const descCol   = findHeader(headers, DESC_ALIASES);
    const amountCol = findHeader(headers, AMOUNT_ALIASES);

    // All three columns are required
    if (!dateCol || !descCol || !amountCol) {
        const missing = [];
        if (!dateCol)   missing.push('Date');
        if (!descCol)   missing.push('Description');
        if (!amountCol) missing.push('Amount');
        return {
            skippedCount: 0,
            transactions: [],
            error: `Unable to detect the following column(s) in your CSV: ${missing.join(', ')}. Please submit feedback so we can add support for your bank's format.`
        };
    }

    const mapped = rows.map(row => ({
        Date:        normalizeDate(row[dateCol]),
        Description: String(row[descCol] || '').trim(),
        Amount:      parseAmount(row[amountCol]),
    }));

    const transactions = mapped.filter(isUsableTransaction);

    return { transactions, error: null, skippedCount: mapped.length - transactions.length };
}

/**
 * Parse a HEADERLESS CSV (e.g. TD Bank).
 * Assumes a fixed column layout:
 *   Index 0 = Date
 *   Index 1 = Description
 *   Index 2 = Money Out (withdrawal, will become negative)
 *   Index 3 = Money In  (deposit, will stay positive)
 *   Index 4 = Balance   (ignored)
 *
 * @param {Array[]} rows – Array of arrays (no header row).
 * @returns {{ transactions: Array, error: string|null }}
 */
function parseWithoutHeaders(rows) {
    if (rows.length === 0) return { transactions: [], error: 'CSV file is empty.', skippedCount: 0 };

    const mapped = rows.map(row => {
        // A blank cell here is meaningful: it means "not this direction", not
        // "unparseable". Only when BOTH sides are blank is the amount unusable.
        const moneyOut = parseAmount(row[2]);
        const moneyIn  = parseAmount(row[3]);
        const hasOut = isFinite(moneyOut) && moneyOut !== 0;
        const hasIn  = isFinite(moneyIn)  && moneyIn  !== 0;

        let amount;
        if (hasOut) {
            amount = -1 * Math.abs(moneyOut);
        } else if (hasIn) {
            amount = Math.abs(moneyIn);
        } else if (isFinite(moneyOut) || isFinite(moneyIn)) {
            amount = 0; // an explicit 0.00 in the file
        } else {
            amount = NaN; // both cells blank/garbage — row is unusable
        }

        return {
            Date:        normalizeDate(row[0]),
            Description: String(row[1] || '').trim(),
            Amount:      amount,
        };
    });

    const transactions = mapped.filter(isUsableTransaction);

    return { transactions, error: null, skippedCount: mapped.length - transactions.length };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a bank CSV file into a standardized array of transaction objects.
 *
 * Automatically detects whether the file has headers (e.g. Chase) or not
 * (e.g. TD Bank) and applies the appropriate parsing strategy.
 *
 * Note on the two different `skipEmptyLines` settings below — they are
 * deliberately not the same value:
 *
 * - Preview pass uses 'greedy'. Plain `true` only drops lines that are
 *   literally empty, so a file padded with ",,,," rows ABOVE its header would
 *   hand us `["","",""]` as the "first row", fail header detection, and get
 *   parsed positionally as headerless garbage. 'greedy' skips to the real header.
 *
 * - Full pass uses `true`. We want the padding rows to reach
 *   `isUsableTransaction` so they can be counted and reported back to the user.
 *   Under 'greedy' they vanish inside PapaParse and `skippedCount` would
 *   under-report (1 instead of 18 on a typical Chase debit export).
 *
 * The rejection itself is enforced by `isUsableTransaction`, not by the flag.
 *
 * @param {File} file – The CSV File object from a file input.
 * @returns {Promise<{ transactions: Array<{Date: string, Description: string, Amount: number}>, error: string|null, skippedCount: number }>}
 */
export function parseBankCSV(file) {
    return new Promise((resolve) => {
        // Step 1: Quick peek at the first row to decide the parsing strategy
        Papa.parse(file, {
            header: false,
            skipEmptyLines: 'greedy',
            preview: 1, // Read only the first row
            complete: (preview) => {
                const firstRow = preview.data[0];
                const useHeaders = hasHeaders(firstRow);

                // Step 2: Full parse with the determined strategy
                Papa.parse(file, {
                    header: useHeaders,
                    skipEmptyLines: true, // see note above — 'greedy' would hide the skip count
                    complete: (results) => {
                        let parsed;
                        if (useHeaders) {
                            parsed = parseWithHeaders(results.data);
                        } else {
                            parsed = parseWithoutHeaders(results.data);
                        }
                        resolve(parsed);
                    },
                    error: (err) => {
                        resolve({ transactions: [], error: `CSV parsing error: ${err.message}`, skippedCount: 0 });
                    }
                });
            },
            error: (err) => {
                resolve({ transactions: [], error: `CSV parsing error: ${err.message}`, skippedCount: 0 });
            }
        });
    });
}
