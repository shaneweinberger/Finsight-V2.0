/**
 * Secondary categories are manually-assigned tags that sit alongside the
 * AI-assigned primary category (e.g. "Napa Weekend", "Summer Weekend Trips").
 * A transaction can carry zero, one, or many.
 *
 * Assignments live on silver_transactions.secondary_categories as a JSONB array
 * of names — mirroring how the primary `category` is stored by name rather than
 * by foreign key. This helper tolerates the rawer shapes a row might carry
 * (null, a JSON string, a single name) and always hands back an array.
 */
export function normalizeSecondaryCategories(value) {
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string' && v.trim());
    if (!value) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                return normalizeSecondaryCategories(JSON.parse(trimmed));
            } catch {
                return [];
            }
        }
        return [trimmed];
    }
    return [];
}
