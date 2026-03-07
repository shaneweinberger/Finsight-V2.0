/**
 * FinSight Design System — Single source of truth for all UI colors.
 *
 * How it works:
 *   1. This file defines every color token.
 *   2. ThemeProvider.jsx flattens them into CSS custom properties (--color-*).
 *   3. tailwind.config.js maps those variables to semantic Tailwind utilities.
 *   4. Components use classes like `bg-surface-card`, `text-primary`, `border-divider`.
 *
 * To change a color, edit it here — it propagates everywhere automatically.
 */

export const theme = {

    // ── Category Palette ──────────────────────────────────────────────────────
    // Canonical color ramp auto-assigned to new categories (and used as a
    // fallback in charts). Source of truth: src/lib/categoryColors.js.
    // Palette: dark green → teal → navy → slate/grey extended range.
    categoryPalette: [
        "#FDF9F5", "#F7F0E8", "#EFE5D8", "#E7DAC9", "#DCC7B6",
        "#CBB49E", "#B8A089", "#A3B0A7", "#86968B", "#697D70",
        "#4C6356", "#393939", "#2B2018"
    ],

    // ── Surfaces ──────────────────────────────────────────────────────────────
    surface: {
        background: '#f8fafc',      // slate-50  — page background
        card: '#ffffff',      // white     — cards, panels
        cardHover: '#f8fafc',      // slate-50  — card hover state
        raised: '#ffffff',      // white     — elevated components (popovers, dropdowns)
        overlay: 'rgba(15, 23, 42, 0.45)', // backdrop behind modals
    },

    // ── Text ─────────────────────────────────────────────────────────────────
    text: {
        primary: '#0f172a',       // slate-900
        secondary: '#034638',       // slate-700
        muted: '#64748b',       // slate-500
        faint: '#94a3b8',       // slate-400
        inverse: '#ffffff',       // white (on dark backgrounds)
        link: '#034638',       // indigo-500
        linkHover: '#034638',       // indigo-600
    },

    // ── Borders ──────────────────────────────────────────────────────────────
    border: {
        default: '#e2e8f0',        // slate-200
        light: '#f1f5f9',        // slate-100
        focus: '#034638',        // indigo-300
        divider: '#e2e8f0',        // slate-200
    },

    // ── Primary (accent) ──────────────────────────────────────────────────────
    primary: {
        base: '#034638',       // main accent (buttons, links, icons)
        hover: '#034638',       // darker hover
        text: '#ffffff',       // text on primary bg
        light: '#eef2ff',       // very light tint (bg highlights) — was indigo-50
        lightText: '#034638',       // text on light bg — was indigo-700
        medium: '#c7d2fe',       // medium tint (active tabs) — was indigo-100
        ring: '#c7d2fe',       // focus rings, subtle borders — was indigo-200
        border: '#034638',       // accent borders (focus) — was indigo-300
        shadow: '#c7d2fe',       // box shadow — was indigo-200
    },

    // ── Secondary (slate) ────────────────────────────────────────────────────
    secondary: {
        base: '#f1f5f9',          // slate-100
        hover: '#e2e8f0',          // slate-200
        text: '#034638',          // slate-600
        border: '#e2e8f0',          // slate-200
    },

    // ── Danger (rose) ────────────────────────────────────────────────────────
    danger: {
        base: '#e11d48',       // rose-600
        hover: '#be123c',       // rose-700
        text: '#ffffff',
        light: '#fff1f2',       // rose-50
        lightText: '#be123c',       // rose-700
        border: '#fecdd3',       // rose-200
    },

    // ── Success (emerald) ────────────────────────────────────────────────────
    success: {
        base: '#059669',       // emerald-600
        light: '#ecfdf5',       // emerald-50
        lightText: '#047857',       // emerald-700
        border: '#a7f3d0',       // emerald-200
    },

    // ── Inputs ───────────────────────────────────────────────────────────────
    input: {
        background: '#ffffff',
        border: '#e2e8f0',     // slate-200
        focusBorder: '#034638',     // indigo-300
        focusRing: '#e0e7ff',     // indigo-100
        placeholder: '#034638',     // slate-400
        disabled: '#f1f5f9',     // slate-100
    },

    // ── Table ────────────────────────────────────────────────────────────────
    table: {
        headerBg: '#f8fafc',      // slate-50
        headerText: '#64748b',      // slate-500
        rowBg: '#ffffff',
        rowHover: '#f8fafc',      // slate-50
        border: '#f1f5f9',      // slate-100
    },

    // ── Chart ────────────────────────────────────────────────────────────────
    chart: {
        gridline: '#f1f5f9',   // slate-100
        axisLabel: '#94a3b8',   // slate-400
        tooltipBg: '#ffffff',
        tooltipBorder: '#e2e8f0',   // slate-200
        tooltipText: '#334155',   // slate-700
        cursorFill: '#f8fafc',   // slate-50
        remaining: '#cbd5e1',   // slate-300 — "remaining categories" segment
    },

    // ── Trends Graph (Overview page — Spending Trends bar chart) ─────────────
    trendsGraph: {
        // Hover tooltip (lightweight, shown while mousing over a bar)
        hoverTooltip: {
            background: '#ffffff',        // fully opaque white — no transparency
            border: '#e2e8f0',            // slate-200
            shadow: '0 4px 16px 0 rgba(15,23,42,0.10)',
            labelColor: '#94a3b8',        // slate-400 — period label
            categoryColor: '#1e293b',     // slate-800
            amountColor: '#64748b',       // slate-500
            percentColor: '#034638',      // accent
            hintColor: '#94a3b8',         // slate-400 — "Click to see actions"
        },
        // Locked (clicked) expanded card
        lockedCard: {
            background: '#ffffff',        // fully opaque white
            border: '#e2e8f0',            // slate-200
            headerBorder: '#f1f5f9',      // slate-100
            titleColor: '#1e293b',        // slate-800
            metaColor: '#94a3b8',         // slate-400
            amountColor: '#1e293b',       // slate-800
            labelColor: '#64748b',        // slate-500
            percentColor: '#034638',      // accent
            closeButtonColor: '#cbd5e1',  // slate-300
            closeButtonHover: '#64748b',  // slate-500
            // Action buttons
            actionButtonText: '#334155',       // slate-700
            actionButtonHoverBg: '#f8fafc',    // slate-50
            focusActionHoverBg: '#eef2ff',     // accent-light
            focusActionHoverText: '#034638',   // accent-light-text
        },
        // Bar chart chrome
        cursorFill: '#f8fafc',            // slate-50 — column hover highlight
        gridline: '#f1f5f9',              // slate-100
        axisLabel: '#94a3b8',             // slate-400
        remaining: '#cbd5e1',             // slate-300 — "remaining" stacked segment
        // Pill row (draggable category pills)
        pillBorder: '#e2e8f0',            // slate-200
        pillBackground: '#f8fafc',        // slate-50
        pillHoverBorder: '#cbd5e1',       // slate-300
        pillText: '#334155',              // slate-700
        pillDragOpacity: 0.4,
        addCategoryText: '#64748b',       // slate-500
        addCategoryBorder: '#cbd5e1',     // slate-300 dashed
    },

    // ── Badge / Pill / Chip ──────────────────────────────────────────────────
    badge: {
        defaultBg: '#f1f5f9',     // slate-100
        defaultText: '#475569',     // slate-600
        selectedBg: '#eef2ff',     // indigo-50
        selectedText: '#034638',     // indigo-700
        hoverBg: '#e2e8f0',     // slate-200
    },

    // ── Modal / Popover / Tooltip ────────────────────────────────────────────
    modal: {
        overlay: 'rgba(15, 23, 42, 0.45)',
        background: '#ffffff',
        border: '#e2e8f0',      // slate-200
    },

    // ── Alerts / Toasts ──────────────────────────────────────────────────────
    alert: {
        successBg: '#ecfdf5',   // emerald-50
        successText: '#047857',   // emerald-700
        successBorder: '#a7f3d0',   // emerald-200

        warningBg: '#fffbeb',   // amber-50
        warningText: '#b45309',   // amber-700
        warningBorder: '#fde68a',   // amber-200

        errorBg: '#fff1f2',   // rose-50
        errorText: '#be123c',   // rose-700
        errorBorder: '#fecdd3',   // rose-200

        infoBg: '#eff6ff',   // blue-50
        infoText: '#034638',   // blue-700
        infoBorder: '#bfdbfe',   // blue-200
    },

    // ── Links ────────────────────────────────────────────────────────────────
    link: {
        default: '#034638',         // indigo-500
        hover: '#034638',         // indigo-600
    },

    // ── Sidebar (existing — unchanged) ───────────────────────────────────────
    sidebar: {
        backgroundColor: '#212121ff',
        borderColor: '#272727ff',
        activeItemBackground: '#034638',
        activeItemText: '#ffffff',
        inactiveItemText: '#d6d6d6ff',
        hoverItemBackground: '#454545ff',
        hoverItemText: '#ffffff',
        logoText: '#ffffff',
        dropdownBackground: '#1c1c1cff',
        dropdownBorder: '#3b3b3bff',
        dropdownHoverBackground: '#2d2d2dff',
        userProfileHoverBackground: '#2d2d2dff',
        userText: '#e2e8f0',
        userSubtext: '#94a3b8',
        toggleButtonColor: '#94a3b8',
        toggleButtonHoverColor: '#2d2d2dff',
    },
};
