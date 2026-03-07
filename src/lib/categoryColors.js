/**
 * Shared category color palette — dark green / teal / navy / slate.
 *
 * Used in two ways:
 *   1. Auto-assigned on insert: the next free color is picked by cycling
 *      through this array based on how many categories already exist.
 *   2. Fallback rendering: if a saved category somehow has no color stored,
 *      CATEGORY_COLORS[index % length] is used as a visual fallback.
 *
 * To change the whole app's color language, edit this file only.
 */
export const CATEGORY_COLORS = [
    // ── THE BEIGES (Warm Sands & Limestones) ──
    "#FDF9F5", // 1. Main Background / Housing (Linen)
    "#F7F0E8", // 2. Utilities (Travertine)
    "#EFE5D8", // 3. Transport (Champagne Sand)
    "#E7DAC9", // 4. Food & Dining (Warm Oat)
    "#DCC7B6", // 5. Shopping (Almond)
    "#CBB49E", // 6. Entertainment (Toasted Sesame)
    "#B8A089", // 7. Health (Soft Clay)

    // ── THE GREENS (Sage & Cedar) ──
    "#A3B0A7", // 8. Education (Misty Sage)
    "#86968B", // 9. Personal Care (Dusted Moss)
    "#697D70", // 10. Travel (Eucalyptus)
    "#4C6356", // 11. Insurance (Dark Cedar)

    // ── THE ANCHORS (Deep Earth) ──
    "#393939", // 12. Miscellaneous (Mine Shaft - Deep Charcoal)
    "#2B2018"  // 13. Fees/Taxes (Espresso Bean)
];
