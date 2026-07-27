import React, { useState, useEffect } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { useSessionState } from '../../hooks/useSessionState';
import { supabase } from '../../lib/supabaseClient';
import TransactionTable from './TransactionTable';
import {
    Calendar,
    Filter,
    Loader2,
    Search,
    Download,
    ArrowUpDown,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Plus,
    X,
    ChevronDown,
    CircleSlash,
    Check,
    Tag,
    Tags,
    Edit2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { CATEGORY_COLORS, SECONDARY_CATEGORY_COLORS } from '../../lib/categoryColors';
import { normalizeSecondaryCategories } from '../../lib/secondaryCategories';
import { theme } from '../../theme';

// Human-readable labels for the active-filter chips
const FILTER_FIELD_LABELS = {
    transaction_account: 'Account',
    secondary_categories: 'Secondary'
};

// Sentinel used in the secondary-category filter for transactions with no tags
const UNTAGGED = 'Untagged';

export default function Analysis() {
    const location = useLocation();
    const navigate = useNavigate();

    // Date Range from context (Default fallback or initial)
    const { startDate: ctxStartDate, endDate: ctxEndDate } = useOutletContext();

    // ── View state — persisted across in-app navigation via sessionStorage ──────
    // location.state (deep-link from Overview chart click) always takes priority.
    const defaultMonth = (() => {
        const now = new Date();
        now.setHours(12, 0, 0, 0);
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })();

    const [filterType, setFilterType] = useSessionState('analysis.filterType', 'month');
    const [selectedMonth, setSelectedMonth] = useSessionState('analysis.selectedMonth', defaultMonth);
    const [selectedWeek, setSelectedWeek] = useSessionState('analysis.selectedWeek', '');

    // Apply location.state overrides (deep-links from Overview) — runs once on mount
    useEffect(() => {
        if (!location.state) return;
        if (location.state.filterType) setFilterType(location.state.filterType);
        else if (location.state.startDate) setFilterType('range');
        if (location.state.selectedMonth) setSelectedMonth(location.state.selectedMonth);
        if (location.state.selectedWeek) setSelectedWeek(location.state.selectedWeek);
        // A deep-linked category has to land on the category breakdown, even if the
        // panel was left in secondary mode last visit.
        if (location.state.category) setBreakdownMode('category');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Local state for specific filters (range dates — not persisted, derive from context)
    const [localStartDate, setLocalStartDate] = useState(() => {
        if (location.state && location.state.startDate) return location.state.startDate;
        return ctxStartDate;
    });

    const [localEndDate, setLocalEndDate] = useState(() => {
        if (location.state && location.state.endDate) return location.state.endDate;
        return ctxEndDate;
    });

    // Table view state
    const [dateFormat, setDateFormat] = useState('friendly');

    // Column Filters state
    const [advancedFilters, setAdvancedFilters] = useState(() => {
        if (location.state && location.state.category) {
            const id = Math.random().toString(36).substr(2, 9);
            return [{ id, field: 'category', operator: 'is', value: [location.state.category] }];
        }
        return [];
    });

    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [activeValuePopover, setActiveValuePopover] = useState(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [secondaryCategories, setSecondaryCategories] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [editDrafts, setEditDrafts] = useState({});
    const [isSavingEdits, setIsSavingEdits] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(null);

    // Breakdown panel: 'category' (primary, with pie) or 'secondary' (tags)
    const [breakdownMode, setBreakdownMode] = useSessionState('analysis.breakdownMode', 'category');
    const [selectedSecondary, setSelectedSecondary] = useState(null);
    const isSecondaryMode = breakdownMode === 'secondary';

    // Clear the location state so that manual refreshes don't re-trigger it
    useEffect(() => {
        if (location.state) {
            navigate('.', { replace: true, state: null });
        }
    }, [location, navigate]);


    // Generate recent weeks for the selector
    const getWeekOptions = () => {
        const weeks = [];
        const now = new Date();
        now.setHours(12, 0, 0, 0); // Anchor to midday to prevent timezone shift issues

        // Go back to the most recent Monday
        const current = new Date(now);
        current.setDate(now.getDate() - ((now.getDay() + 6) % 7));

        for (let i = 0; i < 12; i++) {
            const start = new Date(current);
            start.setDate(current.getDate() - (i * 7));
            const end = new Date(start);
            end.setDate(start.getDate() + 6);

            const startStr = start.toISOString().split('T')[0];
            const endStr = end.toISOString().split('T')[0];

            weeks.push({
                start: startStr,
                end: endStr,
                label: `Week of ${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
            });
        }
        return weeks;
    };

    // Generate recent months for the selector
    const getMonthOptions = () => {
        const months = [];
        const now = new Date();
        now.setHours(12, 0, 0, 0); // Anchor to midday

        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 12, 0, 0, 0);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            months.push({ value: val, label });
        }
        return months;
    };

    // Set defaults ONLY if not already set (e.g., by location.state)
    useEffect(() => {
        const weeks = getWeekOptions();
        const months = getMonthOptions();

        // Use functional state updates to check the *current* state 
        // before applying defaults, preventing overwrites of location.state
        setSelectedWeek(prev => prev || weeks[0].start);
        setSelectedMonth(prev => prev || months[0].value);
    }, []);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page on filter change
        fetchData();
    }, [filterType, localStartDate, localEndDate, selectedWeek, selectedMonth]);

    // Reset to page 1 whenever column filters or category selection change
    useEffect(() => {
        setCurrentPage(1);
    }, [advancedFilters, selectedCategory, selectedSecondary]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchCategories(), fetchSecondaryCategories(), fetchAccounts()]);
        setLoading(false);
    };

    const fetchAccounts = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_accounts')
                .select('account_name')
                .eq('user_id', user.id)
                .order('account_name');

            if (error) throw error;
            setAccounts(data ? data.map(d => d.account_name).filter(Boolean) : []);
        } catch (err) {
            console.error('Error fetching accounts:', err);
        }
    };

    const fetchTransactions = async () => {
        try {
            let query = supabase
                .from('silver_transactions')
                .select('*')
                .order('effective_date', { ascending: false });

            let start, end;

            if (filterType !== 'all') {
                if (filterType === 'week') {
                    start = selectedWeek;
                    const d = new Date(selectedWeek + 'T12:00:00');
                    d.setDate(d.getDate() + 6);
                    end = d.toISOString().split('T')[0];
                } else if (filterType === 'month') {
                    const [year, month] = selectedMonth.split('-');
                    start = `${year}-${month}-01`;
                    const d = new Date(parseInt(year), parseInt(month), 0);
                    end = d.toISOString().split('T')[0];
                } else if (filterType === 'range') {
                    start = localStartDate;
                    end = localEndDate;
                }

                if (start) query = query.gte('effective_date', start);
                if (end) query = query.lte('effective_date', end);
            }

            const { data, error } = await query;

            if (error) throw error;
            setTransactions(data || []);
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Error fetching transactions:', err);
        }
    };

    const fetchCategories = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_categories')
                .select('name, color, id')
                .eq('user_id', user.id)
                .order('name');

            if (error) throw error;
            const fetched = data || [];

            // ── One-time color backfill (same as Categories.jsx) ──────────────
            // Write a palette color to any category that has null color in the DB.
            const uncolored = fetched.filter(c => !c.color);
            if (uncolored.length > 0) {
                await Promise.all(
                    uncolored.map((cat) => {
                        const globalIdx = fetched.findIndex(c => c.id === cat.id);
                        return supabase
                            .from('user_categories')
                            .update({ color: CATEGORY_COLORS[globalIdx % CATEGORY_COLORS.length] })
                            .eq('id', cat.id);
                    })
                );
                // Re-fetch with saved colors
                const { data: refreshed, error: rErr } = await supabase
                    .from('user_categories')
                    .select('name, color, id')
                    .eq('user_id', user.id)
                    .order('name');
                if (rErr) throw rErr;
                setCategories(refreshed || []);
            } else {
                setCategories(fetched);
            }
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    // ── Secondary categories ────────────────────────────────────────────────
    // Manual tags that cut across primary categories (e.g. "Napa Weekend").
    // Stored on silver_transactions.secondary_categories as an array of names.
    const fetchSecondaryCategories = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_secondary_categories')
                .select('id, name, color')
                .eq('user_id', user.id)
                .order('name');

            if (error) throw error;
            setSecondaryCategories(data || []);
        } catch (err) {
            console.error('Error fetching secondary categories:', err);
        }
    };

    const handleCreateSecondaryCategory = async (name) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const color = SECONDARY_CATEGORY_COLORS[secondaryCategories.length % SECONDARY_CATEGORY_COLORS.length];
        const { data, error } = await supabase
            .from('user_secondary_categories')
            .insert([{ name, color, user_id: user.id }])
            .select('id, name, color')
            .single();

        if (error) {
            throw new Error(error.code === '23505' ? 'That secondary category already exists.' : error.message);
        }

        setSecondaryCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        return data;
    };

    const handleRenameSecondaryCategory = async (option, newName) => {
        const { error } = await supabase
            .from('user_secondary_categories')
            .update({ name: newName })
            .eq('id', option.id);

        if (error) {
            throw new Error(error.code === '23505' ? 'That secondary category already exists.' : error.message);
        }

        // Assignments are stored by name, so every tagged transaction has to be
        // rewritten — including rows outside the currently loaded date range.
        const { error: rpcError } = await supabase.rpc('rename_secondary_category', {
            p_old_name: option.name,
            p_new_name: newName
        });
        if (rpcError) throw new Error(rpcError.message);

        setSecondaryCategories(prev =>
            prev.map(c => (c.id === option.id ? { ...c, name: newName } : c))
                .sort((a, b) => a.name.localeCompare(b.name))
        );
        setTransactions(prev => prev.map(tx => {
            const tags = normalizeSecondaryCategories(tx.secondary_categories);
            if (!tags.includes(option.name)) return tx;
            return { ...tx, secondary_categories: tags.map(t => (t === option.name ? newName : t)) };
        }));
        setEditDrafts(prev => {
            const next = {};
            for (const [id, draft] of Object.entries(prev)) {
                if (!Array.isArray(draft.secondary_categories)) { next[id] = draft; continue; }
                next[id] = { ...draft, secondary_categories: draft.secondary_categories.map(t => (t === option.name ? newName : t)) };
            }
            return next;
        });
    };

    const handleDeleteSecondaryCategory = async (option) => {
        const { error: rpcError } = await supabase.rpc('remove_secondary_category', { p_name: option.name });
        if (rpcError) throw new Error(rpcError.message);

        const { error } = await supabase
            .from('user_secondary_categories')
            .delete()
            .eq('id', option.id);
        if (error) throw new Error(error.message);

        setSecondaryCategories(prev => prev.filter(c => c.id !== option.id));
        setTransactions(prev => prev.map(tx => {
            const tags = normalizeSecondaryCategories(tx.secondary_categories);
            if (!tags.includes(option.name)) return tx;
            return { ...tx, secondary_categories: tags.filter(t => t !== option.name) };
        }));
        setEditDrafts(prev => {
            const next = {};
            for (const [id, draft] of Object.entries(prev)) {
                if (!Array.isArray(draft.secondary_categories)) { next[id] = draft; continue; }
                next[id] = { ...draft, secondary_categories: draft.secondary_categories.filter(t => t !== option.name) };
            }
            return next;
        });
        // Drop the deleted tag from any active filter so the table doesn't go blank
        setAdvancedFilters(prev => prev.map(f => (
            f.field === 'secondary_categories' && Array.isArray(f.value)
                ? { ...f, value: f.value.filter(v => v !== option.name) }
                : f
        )));
    };

    // Derived category names for backward compat
    const categoryNames = categories.map(c => c.name);
    const secondaryCategoryNames = secondaryCategories.map(c => c.name);

    const getSecondaryColor = (name) => {
        const match = secondaryCategories.find(c => c.name === name);
        if (match?.color) return match.color;
        const idx = secondaryCategoryNames.indexOf(name);
        return SECONDARY_CATEGORY_COLORS[(idx === -1 ? 0 : idx) % SECONDARY_CATEGORY_COLORS.length];
    };

    // Color helper: prefers DB color, case-insensitive name match, then palette fallback
    const getColor = (catName, fallbackIndex = 0) => {
        const cat = categories.find(c => c.name.toLowerCase() === catName?.toLowerCase());
        if (cat?.color) return cat.color;
        return CATEGORY_COLORS[fallbackIndex % CATEGORY_COLORS.length];
    };

    const addFilter = (field) => {
        const id = Math.random().toString(36).substr(2, 9);
        let operator = 'includes';
        let value = '';

        if (field === 'amount') operator = 'gt';
        if (field === 'transaction_account') {
            operator = 'is';
            value = [];
        }
        if (field === 'category') {
            operator = 'is';
            value = [];
        }
        if (field === 'secondary_categories') {
            operator = 'is';
            value = [];
        }

        setAdvancedFilters([...advancedFilters, { id, field, operator, value }]);
        setShowFilterMenu(false);
    };

    const removeFilter = (id) => {
        setAdvancedFilters(advancedFilters.filter(f => f.id !== id));
    };

    const updateFilter = (id, updates) => {
        setAdvancedFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleCategoryClick = (category) => {
        const isDeselect = selectedCategory === category;
        setSelectedCategory(isDeselect ? null : category);

        // Sync with advancedFilters for the table pill UI
        const existingFilter = advancedFilters.find(f => f.field === 'category');

        if (isDeselect) {
            // Remove the filter if we are deselecting
            if (existingFilter) {
                removeFilter(existingFilter.id);
            }
        } else {
            if (existingFilter) {
                // Update existing filter
                updateFilter(existingFilter.id, { value: [category], operator: 'is' });
            } else {
                // Add new filter
                const id = Math.random().toString(36).substr(2, 9);
                setAdvancedFilters(prev => [...prev, { id, field: 'category', operator: 'is', value: [category] }]);
            }
        }
    };

    // Clicking a row in the secondary breakdown drives the same filter pill the
    // "Secondary Category" filter menu produces, so the two stay in sync.
    const handleSecondaryClick = (name) => {
        const isDeselect = selectedSecondary === name;
        setSelectedSecondary(isDeselect ? null : name);

        const existingFilter = advancedFilters.find(f => f.field === 'secondary_categories');

        if (isDeselect) {
            if (existingFilter) {
                removeFilter(existingFilter.id);
            }
        } else if (existingFilter) {
            updateFilter(existingFilter.id, { value: [name], operator: 'is' });
        } else {
            const id = Math.random().toString(36).substr(2, 9);
            setAdvancedFilters(prev => [...prev, { id, field: 'secondary_categories', operator: 'is', value: [name] }]);
        }
    };

    // Switching modes drops the outgoing view's row selection — otherwise its
    // filter pill would keep narrowing the table with nothing highlighted.
    const handleBreakdownModeChange = (mode) => {
        if (mode === breakdownMode) return;

        const staleSelection = mode === 'secondary' ? selectedCategory : selectedSecondary;
        const staleField = mode === 'secondary' ? 'category' : 'secondary_categories';
        if (staleSelection) {
            const staleFilter = advancedFilters.find(f => f.field === staleField);
            if (staleFilter) removeFilter(staleFilter.id);
        }

        setBreakdownMode(mode);
    };

    // Sync selectedCategory when filters change manually
    useEffect(() => {
        const catFilter = advancedFilters.find(f => f.field === 'category');
        if (!catFilter || !catFilter.value || catFilter.value.length !== 1 || catFilter.operator !== 'is') {
            setSelectedCategory(null);
        } else {
            setSelectedCategory(catFilter.value[0]);
        }
    }, [advancedFilters]);

    // Same for the secondary selection
    useEffect(() => {
        const secFilter = advancedFilters.find(f => f.field === 'secondary_categories');
        if (!secFilter || !Array.isArray(secFilter.value) || secFilter.value.length !== 1 || secFilter.operator !== 'is') {
            setSelectedSecondary(null);
        } else {
            setSelectedSecondary(secFilter.value[0]);
        }
    }, [advancedFilters]);

    // Base filtered transactions applying all advancedFilters except the UI category selection.
    const baseFilteredTransactions = React.useMemo(() => {
        return transactions.filter(tx => {
            for (const filter of advancedFilters) {
                const { field, operator, value } = filter;
                if (value === '' && !['is', 'isNot'].includes(operator)) continue;

                const txValue = tx[field];

                if (field === 'description') {
                    const desc = (txValue || '').toLowerCase();
                    const val = value.toLowerCase();
                    if (operator === 'is' && desc !== val) return false;
                    if (operator === 'isNot' && desc === val) return false;
                    if (operator === 'includes' && !desc.includes(val)) return false;
                }

                if (field === 'transaction_account') {
                    const type = (txValue || '').toLowerCase();
                    const valArray = Array.isArray(value) ? value : [value];
                    if (valArray.length === 0) continue;
                    const isMatch = valArray.map(v => v.toLowerCase()).includes(type);
                    if (operator === 'is' && !isMatch) return false;
                    if (operator === 'isNot' && isMatch) return false;
                }

                if (field === 'category') {
                    // Bypass the filtering for base stats if this is exactly the selectedCategory pill.
                    // Only while the category breakdown is the active view — otherwise the pill is
                    // just a normal filter and the secondary breakdown should respect it.
                    if (!isSecondaryMode && selectedCategory && operator === 'is' && value.length === 1 && value[0].toLowerCase() === selectedCategory.toLowerCase()) {
                        continue;
                    }

                    const valArray = Array.isArray(value) ? value : [value];
                    if (valArray.length === 0) continue;

                    const cat = (txValue || 'Uncategorized').toLowerCase();
                    const isMatch = valArray.map(v => v.toLowerCase()).includes(cat);
                    if (operator === 'is' && !isMatch) return false;
                    if (operator === 'isNot' && isMatch) return false;
                }

                if (field === 'secondary_categories') {
                    // Same idea in reverse: only the active secondary breakdown gets the bypass
                    if (isSecondaryMode && selectedSecondary && operator === 'is' && Array.isArray(value) && value.length === 1 && value[0].toLowerCase() === selectedSecondary.toLowerCase()) {
                        continue;
                    }

                    const valArray = Array.isArray(value) ? value : [value];
                    if (valArray.length === 0) continue;

                    const tags = normalizeSecondaryCategories(txValue);
                    // "is" matches a transaction carrying ANY of the selected tags.
                    // Untagged is its own selectable value.
                    const isMatch = valArray.some(v => (
                        v === UNTAGGED ? tags.length === 0 : tags.some(t => t.toLowerCase() === v.toLowerCase())
                    ));
                    if (operator === 'is' && !isMatch) return false;
                    if (operator === 'isNot' && isMatch) return false;
                }

                if (field === 'amount') {
                    const amt = Math.abs(parseFloat(txValue));
                    const val = parseFloat(value);
                    if (isNaN(val)) continue;
                    if (operator === 'gt' && !(amt > val)) return false;
                    if (operator === 'lt' && !(amt < val)) return false;
                    if (operator === 'eq' && !(amt === val)) return false;
                }
            }
            return true;
        });
    }, [transactions, advancedFilters, selectedCategory, selectedSecondary, isSecondaryMode]);

    // Final filtered transactions for the table: apply the breakdown row selection
    // (primary category or secondary tag) on top of base filters.
    const filteredTransactions = React.useMemo(() => {
        let result = baseFilteredTransactions;

        if (selectedCategory) {
            result = result.filter(tx => {
                const cat = (tx.category || 'Uncategorized').toLowerCase();
                return cat === selectedCategory.toLowerCase();
            });
        }

        if (selectedSecondary) {
            result = result.filter(tx => {
                const tags = normalizeSecondaryCategories(tx.secondary_categories);
                return selectedSecondary === UNTAGGED
                    ? tags.length === 0
                    : tags.some(t => t.toLowerCase() === selectedSecondary.toLowerCase());
            });
        }

        // When a row is selected, pre-sort by absolute amount descending so that
        // the highest-spending transactions are always on page 1 before paginating.
        if (selectedCategory || selectedSecondary) {
            result = [...result].sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0));
        }

        return result;
    }, [baseFilteredTransactions, selectedCategory, selectedSecondary]);

    const categoryStats = React.useMemo(() => {
        const stats = {};
        let totalSpend = 0;

        // Use baseFilteredTransactions so that all categories are present for the UI.
        baseFilteredTransactions.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            if (cat.toLowerCase() === 'income') return;

            const amt = parseFloat(tx.amount || 0);
            const spendAmount = -amt;
            if (!stats[cat]) {
                stats[cat] = { category: cat, spend: 0, count: 0 };
            }
            stats[cat].spend += spendAmount;
            stats[cat].count += 1;
            totalSpend += spendAmount;
        });

        const data = Object.values(stats)
            .map(s => ({
                ...s,
                percent: totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0
            }))
            .sort((a, b) => b.spend - a.spend);

        return { data, totalSpend };
    }, [baseFilteredTransactions]);

    // Secondary categories are multi-valued, so a transaction carrying two tags
    // contributes its full spend to both rows. Percentages are taken against the
    // period's total spend, which means the column can add up to over 100%.
    // Everything untagged collapses into a single trailing row.
    const secondaryStats = React.useMemo(() => {
        const stats = {};
        let totalSpend = 0;

        baseFilteredTransactions.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            if (cat.toLowerCase() === 'income') return;

            const spendAmount = -parseFloat(tx.amount || 0);
            totalSpend += spendAmount;

            const tags = normalizeSecondaryCategories(tx.secondary_categories);
            const keys = tags.length > 0 ? [...new Set(tags)] : [UNTAGGED];

            keys.forEach(key => {
                if (!stats[key]) {
                    stats[key] = { category: key, spend: 0, count: 0 };
                }
                stats[key].spend += spendAmount;
                stats[key].count += 1;
            });
        });

        const data = Object.values(stats)
            .map(s => ({
                ...s,
                percent: totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0
            }))
            .sort((a, b) => {
                if (a.category === UNTAGGED) return 1;
                if (b.category === UNTAGGED) return -1;
                return b.spend - a.spend;
            });

        return { data, totalSpend };
    }, [baseFilteredTransactions]);

    const selectedCategoryInfo = React.useMemo(() => {
        if (!selectedCategory || !categoryStats.data.length) return null;
        const statsIndex = categoryStats.data.findIndex(s => s.category.toLowerCase() === selectedCategory.toLowerCase());
        if (statsIndex === -1) return null;
        return {
            ...categoryStats.data[statsIndex],
            color: getColor(selectedCategory, statsIndex)
        };
    }, [selectedCategory, categoryStats.data]);

    const selectedSecondaryInfo = React.useMemo(() => {
        if (!selectedSecondary || !secondaryStats.data.length) return null;
        const row = secondaryStats.data.find(s => s.category.toLowerCase() === selectedSecondary.toLowerCase());
        if (!row) return null;
        return {
            ...row,
            color: row.category === UNTAGGED ? '#94a3b8' : getSecondaryColor(row.category)
        };
    }, [selectedSecondary, secondaryStats.data, secondaryCategories]);

    // In secondary mode the pie shows the primary-category mix of whatever the
    // table is currently showing — for a selected tag that's "what did Napa
    // Weekend actually get spent on", and with no tag selected it's the same
    // overall mix the category view charts.
    const secondaryPieData = React.useMemo(() => {
        if (!isSecondaryMode || !selectedSecondary) return [];

        const stats = {};
        let totalSpend = 0;

        filteredTransactions.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            if (cat.toLowerCase() === 'income') return;

            const spendAmount = -parseFloat(tx.amount || 0);
            if (!stats[cat]) {
                stats[cat] = { category: cat, spend: 0, count: 0 };
            }
            stats[cat].spend += spendAmount;
            stats[cat].count += 1;
            totalSpend += spendAmount;
        });

        return Object.values(stats)
            .map(s => ({ ...s, percent: totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0 }))
            .sort((a, b) => b.spend - a.spend);
    }, [isSecondaryMode, selectedSecondary, filteredTransactions]);

    // What the breakdown panel is currently driving
    const breakdownStats = isSecondaryMode ? secondaryStats : categoryStats;
    const pieData = isSecondaryMode && selectedSecondary ? secondaryPieData : categoryStats.data;
    const pieTotal = isSecondaryMode && selectedSecondary
        ? (selectedSecondaryInfo?.spend ?? 0)
        : categoryStats.totalSpend;



    const handleBulkEditToggle = () => {
        setIsEditingMode(true);
        setEditDrafts({});
        setSelectedIds(new Set());
    };

    const handleBulkEditCancel = () => {
        setIsEditingMode(false);
        setEditDrafts({});
        setSelectedIds(new Set());
    };

    const onDraftChange = (id, field, value) => {
        setEditDrafts(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    const handleBulkEditSave = async () => {
        const idsToUpdate = Object.keys(editDrafts);
        if (idsToUpdate.length === 0) {
            setIsEditingMode(false);
            return;
        }

        setIsSavingEdits(true);
        try {
            // Update items locally first for immediate UI response
            setTransactions(prev => prev.map(t => {
                const drafted = editDrafts[t.id];
                if (drafted) {
                    const newRecognizedDate = drafted.recognized_date !== undefined ? drafted.recognized_date : t.recognized_date;
                    const newEffectiveDate = newRecognizedDate || t.transaction_date;
                    
                    return { 
                        ...t, 
                        ...drafted, 
                        effective_date: newEffectiveDate,
                        is_edited: true 
                    };
                }
                return t;
            }));

            // Prepare Supabase updates
            const updates = idsToUpdate.map(id => ({
                id,
                ...editDrafts[id],
                is_edited: true,
                updated_at: new Date().toISOString()
            }));

            // Use the standard update approach in Supabase: loop through and update sequentially
            // or use a Postgres function if one exists, but sequential updates are fine for UI batches
            for (const update of updates) {
                const { error } = await supabase
                    .from('silver_transactions')
                    .update(update)
                    .eq('id', update.id);
                if (error) console.error('Error updating transaction', update.id, error);
            }

            setIsEditingMode(false);
            setEditDrafts({});
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Error in bulk edit save:', err);
        } finally {
            setIsSavingEdits(false);
        }
    };

    const handleSelectToggle = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleSelectAll = (ids) => {
        const allAlreadySelected = ids.every(id => selectedIds.has(id));
        if (allAlreadySelected) {
            const next = new Set(selectedIds);
            ids.forEach(id => next.delete(id));
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            ids.forEach(id => next.add(id));
            setSelectedIds(next);
        }
    };

    const handleDeleteSelected = async () => {
        const count = selectedIds.size;
        if (!confirm(`Are you sure you want to delete ${count} transactions? This will remove them from both Silver (processed) and Bronze (raw) tables.`)) return;

        setIsDeleting(true);
        try {
            const selectedTxs = transactions.filter(t => selectedIds.has(t.id));
            const bronzeIds = selectedTxs.map(t => t.bronze_id).filter(Boolean);
            const silverIds = Array.from(selectedIds);

            // 1. Delete from Silver
            const { error: silverError } = await supabase
                .from('silver_transactions')
                .delete()
                .in('id', silverIds);

            if (silverError) throw silverError;

            // 2. Delete from Bronze
            if (bronzeIds.length > 0) {
                const { error: bronzeError } = await supabase
                    .schema('bronze')
                    .from('transactions')
                    .delete()
                    .in('id', bronzeIds);

                if (bronzeError) throw bronzeError;
            }

            setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Error deleting transactions:', err);
            alert(`Failed to delete: ${err.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div
            className="space-y-8 animate-in fade-in duration-700"
            onClick={() => {
                setShowFilterMenu(false);
                setActiveValuePopover(null);
            }}
        >
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Transaction Analysis</h1>
                    <p className="text-slate-500 mt-1">Deep dive into your financial history with advanced filtering.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Filter Type Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {[
                            { id: 'range', label: 'Date Range' },
                            { id: 'week', label: 'Week' },
                            { id: 'month', label: 'Month' },
                            { id: 'all', label: 'All' }
                        ].map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setFilterType(type.id)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${filterType === type.id
                                    ? 'bg-white text-accent shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    {/* Dynamic Filter Inputs */}
                    {filterType === 'month' ? (() => {
                        const monthOptions = getMonthOptions(); // newest first
                        const currentIndex = monthOptions.findIndex(m => m.value === selectedMonth);
                        const canGoPrev = currentIndex < monthOptions.length - 1;
                        const canGoNext = currentIndex > 0;
                        const currentLabel = monthOptions[currentIndex]?.label ?? selectedMonth;
                        return (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => canGoPrev && setSelectedMonth(monthOptions[currentIndex + 1].value)}
                                    disabled={!canGoPrev}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Previous month"
                                >
                                    <ChevronLeft size={18} strokeWidth={2.5} />
                                </button>
                                <div className="flex items-center gap-1 bg-white pl-4 pr-3 py-2 rounded-2xl border border-slate-200 shadow-sm min-h-[44px]">
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="text-sm font-semibold text-slate-700 min-w-[110px] text-center outline-none bg-transparent cursor-pointer appearance-none"
                                        style={{ textAlignLast: 'center' }}
                                    >
                                        {monthOptions.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="text-slate-400 pointer-events-none" />
                                </div>
                                <button
                                    onClick={() => canGoNext && setSelectedMonth(monthOptions[currentIndex - 1].value)}
                                    disabled={!canGoNext}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Next month"
                                >
                                    <ChevronRight size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        );
                    })() : filterType === 'week' ? (() => {
                        const weekOptions = getWeekOptions(); // newest first
                        const currentIndex = weekOptions.findIndex(w => w.start === selectedWeek);
                        const canGoPrev = currentIndex > -1 && currentIndex < weekOptions.length - 1;
                        const canGoNext = currentIndex > 0;
                        return (
                            <div className="relative flex items-center">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => canGoPrev && setSelectedWeek(weekOptions[currentIndex + 1].start)}
                                        disabled={!canGoPrev}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="Previous week"
                                    >
                                        <ChevronLeft size={18} strokeWidth={2.5} />
                                    </button>
                                    <div className="flex items-center gap-1 bg-white pl-4 pr-3 py-2 rounded-2xl border border-slate-200 shadow-sm min-h-[44px]">
                                        <select
                                            value={selectedWeek}
                                            onChange={(e) => setSelectedWeek(e.target.value)}
                                            className="text-sm font-semibold text-slate-700 min-w-[180px] text-center outline-none bg-transparent cursor-pointer appearance-none"
                                            style={{ textAlignLast: 'center' }}
                                        >
                                            {weekOptions.map(w => (
                                                <option key={w.start} value={w.start}>{w.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="text-slate-400 pointer-events-none" />
                                    </div>
                                    <button
                                        onClick={() => canGoNext && setSelectedWeek(weekOptions[currentIndex - 1].start)}
                                        disabled={!canGoNext}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="Next week"
                                    >
                                        <ChevronRight size={18} strokeWidth={2.5} />
                                    </button>
                                </div>
                                <span className="absolute top-full left-0 right-0 text-center text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1 leading-none pointer-events-none">(Monday to Sunday)</span>
                            </div>
                        );
                    })() : (
                        <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm min-h-[44px]">
                            {filterType === 'range' && (
                                <>
                                    <div className="flex items-center gap-2 px-3">
                                        <Calendar size={16} className="text-slate-400" />
                                        <input
                                            type="date"
                                            value={localStartDate}
                                            onChange={(e) => setLocalStartDate(e.target.value)}
                                            className="text-sm font-medium text-slate-700 outline-none w-32"
                                        />
                                    </div>
                                    <div className="text-slate-300">|</div>
                                    <div className="flex items-center gap-2 px-3">
                                        <input
                                            type="date"
                                            value={localEndDate}
                                            onChange={(e) => setLocalEndDate(e.target.value)}
                                            className="text-sm font-medium text-slate-700 outline-none w-32"
                                        />
                                    </div>
                                </>
                            )}

                            {filterType === 'all' && (
                                <div className="flex items-center gap-2 px-4 py-1">
                                    <Filter size={16} className="text-accent" />
                                    <span className="text-sm font-semibold text-slate-600">All Transactions</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Top Charts Section */}
            {!loading && breakdownStats.data.length > 0 && (
                <div className="mb-6">
                    {/* Category Breakdown */}
                    <div className="relative z-20 pl-6">
                        <div className="flex items-center gap-3 mb-0.5">
                            <h3 className="text-base font-bold text-slate-900">
                                {isSecondaryMode ? 'Secondary Category Breakdown' : 'Category Breakdown'}
                            </h3>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                {[
                                    { id: 'category', label: 'Category' },
                                    { id: 'secondary', label: 'Secondary' }
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => handleBreakdownModeChange(mode.id)}
                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${breakdownMode === mode.id
                                            ? 'bg-white text-accent shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 font-medium italic">
                            {isSecondaryMode
                                ? 'Click on a secondary category row to filter your transactions'
                                : 'Click on a category row or chart slice to filter your transactions'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-8">
                                <div className="overflow-x-visible">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {isSecondaryMode ? 'Secondary Category' : 'Category'}
                                                </th>
                                                <th className="pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Spend</th>
                                                <th className="pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Txns</th>
                                                <th className="pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">% of Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {breakdownStats.data.map((row, idx) => {
                                                const activeSelection = isSecondaryMode ? selectedSecondary : selectedCategory;
                                                const isSelected = activeSelection === row.category;
                                                const isDimmed = activeSelection && !isSelected;
                                                const isUntagged = isSecondaryMode && row.category === UNTAGGED;
                                                const rowColor = isSecondaryMode
                                                    ? (isUntagged ? '#94a3b8' : getSecondaryColor(row.category))
                                                    : getColor(row.category, idx);

                                                return (
                                                    <tr
                                                        key={row.category}
                                                        onClick={() => (isSecondaryMode ? handleSecondaryClick(row.category) : handleCategoryClick(row.category))}
                                                        className={`transition-all cursor-pointer ${isSelected ? 'bg-accent-light/30' : isDimmed ? 'opacity-30 grayscale-[0.5]' : 'hover:bg-slate-50/50'
                                                            }`}
                                                    >
                                                        <td className="px-1 py-3 text-sm font-semibold text-slate-700">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isDimmed ? '#cbd5e1' : rowColor }} />
                                                                <span className={`truncate ${isUntagged ? 'italic text-slate-500' : ''}`}>{row.category}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-1 py-3 text-sm font-bold text-slate-700 text-right">${row.spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className="px-1 py-3 text-sm font-medium text-slate-500 text-right">{row.count}</td>
                                                        <td className="px-1 py-3 text-sm font-medium text-slate-500 text-right">
                                                            <div className="flex items-center justify-end gap-3">
                                                                <span className="w-12 text-right text-xs shrink-0">{row.percent.toFixed(1)}%</span>
                                                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                                                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(row.percent, 100))}%`, backgroundColor: isDimmed ? '#cbd5e1' : rowColor }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {isSecondaryMode && (
                                        <p className="text-[11px] text-slate-400 mt-3 italic">
                                            Transactions with more than one secondary category count toward each of them, so percentages can add up to over 100%.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="md:col-span-4 flex flex-col items-center justify-center p-4">
                                <div className="text-center mb-4">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                        {isSecondaryMode && selectedSecondary ? `${selectedSecondary} Spend` : 'Total Expenditures'}
                                    </span>
                                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                                        ${pieTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="w-full h-[230px] scale-110">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                isAnimationActive={false}
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={30}
                                                outerRadius={75}
                                                paddingAngle={2}
                                                dataKey="spend"
                                                nameKey="category"
                                                stroke="none"
                                                onClick={isSecondaryMode ? undefined : (data) => handleCategoryClick(data.category)}
                                                style={{ cursor: isSecondaryMode ? 'default' : 'pointer' }}
                                                labelLine={false}
                                                label={(props) => {
                                                    const { cx, cy, midAngle, outerRadius, value, payload, percent } = props;
                                                    if (isSecondaryMode || !selectedCategory || selectedCategory !== payload.category) return null;

                                                    const RADIAN = Math.PI / 180;
                                                    const radius = outerRadius + 15;
                                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                                    return (
                                                        <text
                                                            x={x}
                                                            y={y}
                                                            fill="#475569"
                                                            textAnchor={x > cx ? 'start' : 'end'}
                                                            dominantBaseline="central"
                                                            fontSize="12"
                                                            fontWeight="bold"
                                                        >
                                                            {`${payload.percent.toFixed(1)}%`}
                                                        </text>
                                                    );
                                                }}
                                            >
                                                {pieData.map((entry, index) => {
                                                    const isSelected = selectedCategory === entry.category;
                                                    const isDimmed = !isSecondaryMode && selectedCategory && !isSelected;
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={isDimmed ? '#cbd5e1' : getColor(entry.category, index)}
                                                            style={{ opacity: isDimmed ? 0.3 : 1, transition: 'all 0.3s' }}
                                                        />
                                                    );
                                                })}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '11px' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                {isSecondaryMode && (
                                    <p className="text-[11px] text-slate-400 text-center mt-2 italic px-2">
                                        {selectedSecondary
                                            ? `Category mix within ${selectedSecondary}`
                                            : 'Category mix — select a secondary category to see its breakdown'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className={`bg-surface-card rounded-2xl flex flex-col relative z-20 transition-all duration-300 ${isEditingMode ? 'border border-accent-border ring-4 ring-accent-light shadow-md' : 'border border-divider shadow-sm'}`}>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-slate-900">Transactions</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-light text-accent-light-text border border-accent-light">
                            {filteredTransactions.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* New Notion-style Filter Toggle */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowFilterMenu(!showFilterMenu);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all border ${showFilterMenu || advancedFilters.length > 0
                                    ? 'bg-accent-light text-accent border-accent-ring shadow-sm'
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                                    }`}
                            >
                                <Plus size={16} />
                                Filter
                            </button>

                            {showFilterMenu && (
                                <div
                                    className="absolute top-full right-0 mt-2 w-56 bg-surface-card rounded-2xl border border-divider shadow-xl z-50 py-2 animate-in zoom-in-95 duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">
                                        Filter by:
                                    </div>
                                    {[
                                        { field: 'description', label: 'Description', icon: Search },
                                        { field: 'transaction_account', label: 'Account', icon: Filter },
                                        { field: 'category', label: 'Category', icon: Tag },
                                        { field: 'secondary_categories', label: 'Secondary Category', icon: Tags },
                                        { field: 'amount', label: 'Amount', icon: ArrowUpDown }
                                    ].map(opt => (
                                        <button
                                            key={opt.field}
                                            disabled={advancedFilters.some(f => f.field === opt.field)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                addFilter(opt.field);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:grayscale disabled:hover:bg-transparent text-left"
                                        >
                                            <opt.icon size={16} className="text-slate-400" />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedIds.size > 0 && isEditingMode && (
                            <button
                                onClick={handleDeleteSelected}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold transition-all border border-rose-100 shadow-sm animate-in zoom-in-95 duration-200"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                Delete Selected ({selectedIds.size})
                            </button>
                        )}

                        {isEditingMode ? (
                            <>
                                <button
                                    onClick={handleBulkEditSave}
                                    disabled={isSavingEdits}
                                    className="flex items-center gap-2 px-4 py-2 bg-accent text-white hover:bg-accent-hover rounded-xl font-bold transition-all shadow-sm animate-in zoom-in-95 duration-200"
                                >
                                    {isSavingEdits ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    Save Changes {Object.keys(editDrafts).length > 0 ? `(${Object.keys(editDrafts).length})` : ''}
                                </button>
                                <button
                                    onClick={handleBulkEditCancel}
                                    disabled={isSavingEdits}
                                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleBulkEditToggle}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 border border-transparent transition-all"
                            >
                                <Edit2 size={16} />
                                Edit
                            </button>
                        )}

                        <button className="p-2 text-slate-500 hover:text-accent hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all shadow-none hover:shadow-sm">
                            <Download size={20} />
                        </button>
                    </div>
                </div>

                {/* Active Filter Chips */}
                {advancedFilters.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
                        {advancedFilters.map((filter) => (
                            <div
                                key={filter.id}
                                className="flex items-center gap-0 bg-white border border-slate-200 rounded-lg shadow-sm animate-in slide-in-from-left duration-200"
                            >
                                <div className="pl-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                                    {FILTER_FIELD_LABELS[filter.field] ?? filter.field}:
                                </div>
                                <div className="flex items-center">
                                    {/* Operator Select */}
                                    <select
                                        value={filter.operator}
                                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                                        className="text-xs font-bold text-accent bg-transparent px-2 py-1.5 outline-none hover:bg-accent-light/50 cursor-pointer appearance-none text-center"
                                        style={{ width: filter.operator.length * 7 + 20 }}
                                    >
                                        {filter.field === 'amount' ? (
                                            <>
                                                <option value="gt">&gt;</option>
                                                <option value="lt">&lt;</option>
                                                <option value="eq">=</option>
                                            </>
                                        ) : filter.field === 'description' ? (
                                            <>
                                                <option value="includes">contains</option>
                                                <option value="is">is</option>
                                                <option value="isNot">is not</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="is">is</option>
                                                <option value="isNot">is not</option>
                                            </>
                                        )}
                                    </select>

                                    {/* Value Input */}
                                    <div className="border-l border-slate-100 flex items-center relative">
                                        {filter.field === 'transaction_account' || filter.field === 'category' || filter.field === 'secondary_categories' ? (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveValuePopover(activeValuePopover === filter.id ? null : filter.id);
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors w-full text-left overflow-hidden max-w-[200px]"
                                                >
                                                    <span className="text-xs font-semibold text-slate-700 truncate">
                                                        {filter.value.length === 0
                                                            ? 'Select...'
                                                            : filter.value.length === 1
                                                                ? filter.value[0].toUpperCase()
                                                                : `${filter.value.length} selected`}
                                                    </span>
                                                    <ChevronDown size={12} className={`text-slate-400 transition-transform ${activeValuePopover === filter.id ? 'rotate-180' : ''}`} />
                                                </button>

                                                {activeValuePopover === filter.id && (
                                                    <div
                                                        className="absolute top-full left-0 mt-1 w-48 bg-surface-card rounded-xl border border-divider shadow-xl z-[60] py-2 animate-in zoom-in-95 duration-200 max-h-64 overflow-y-auto"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {(filter.field === 'transaction_account'
                                                            ? accounts
                                                            : filter.field === 'secondary_categories'
                                                                ? [UNTAGGED, ...secondaryCategoryNames]
                                                                : ['Uncategorized', ...categoryNames]
                                                        ).map(opt => {
                                                            const isSelected = filter.value.some(v => v.toLowerCase() === opt.toLowerCase());
                                                            return (
                                                                <label
                                                                    key={opt}
                                                                    className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                                                                >
                                                                    <div className="relative flex items-center justify-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="peer h-4 w-4 appearance-none rounded border border-slate-300 checked:border-accent checked:bg-accent transition-all cursor-pointer"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                e.stopPropagation();
                                                                                const next = isSelected
                                                                                    ? filter.value.filter(v => v.toLowerCase() !== opt.toLowerCase())
                                                                                    : [...filter.value, opt];
                                                                                updateFilter(filter.id, { value: next });
                                                                            }}
                                                                        />
                                                                        <Check size={12} className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none" />
                                                                    </div>
                                                                    <span className="text-sm font-medium text-slate-700">
                                                                        {opt === 'Uncategorized' ? 'None' : opt}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <input
                                                type={filter.field === 'amount' ? 'number' : 'text'}
                                                value={filter.value}
                                                placeholder="Type a value..."
                                                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                                                className="text-xs font-semibold text-slate-700 bg-transparent px-3 py-1.5 outline-none hover:bg-slate-50 min-w-[80px] max-w-[150px]"
                                            />
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFilter(filter.id);
                                    }}
                                    className="px-2 py-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors border-l border-slate-100"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={() => setAdvancedFilters([])}
                            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
                        >
                            <CircleSlash size={12} />
                            Reset
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex-1 flex items-center justify-center p-20">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-accent" size={40} />
                            <p className="text-slate-500 font-medium">Loading transactions...</p>
                        </div>
                    </div>
                ) : filteredTransactions.length > 0 ? (
                    <>
                        <div className="flex-1">
                            <TransactionTable
                                transactions={filteredTransactions.slice(
                                    (currentPage - 1) * (itemsPerPage === 'all' ? 0 : itemsPerPage),
                                    itemsPerPage === 'all' ? undefined : currentPage * itemsPerPage
                                )}
                                categories={categoryNames}
                                isEditingMode={isEditingMode}
                                editDrafts={editDrafts}
                                onDraftChange={onDraftChange}
                                selectedIds={selectedIds}
                                onSelectToggle={handleSelectToggle}
                                onSelectAll={handleSelectAll}
                                dateFormat={dateFormat}
                                onToggleDateFormat={() => setDateFormat(prev => prev === 'standard' ? 'friendly' : 'standard')}
                                selectedCategoryInfo={isSecondaryMode ? selectedSecondaryInfo : selectedCategoryInfo}
                                secondaryCategories={secondaryCategories}
                                secondaryCategoryColor={getSecondaryColor}
                                onCreateSecondaryCategory={handleCreateSecondaryCategory}
                                onRenameSecondaryCategory={handleRenameSecondaryCategory}
                                onDeleteSecondaryCategory={handleDeleteSecondaryCategory}
                            />
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-500">Show</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
                                            setItemsPerPage(val);
                                            setCurrentPage(1);
                                        }}
                                        className="text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-accent-ring cursor-pointer"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value="all">All</option>
                                    </select>
                                    <span className="text-sm text-slate-500">per page</span>
                                </div>
                                <div className="text-sm text-slate-400 hidden md:block">|</div>
                                <div className="text-sm text-slate-500">
                                    Showing <span className="font-semibold text-slate-700">
                                        {itemsPerPage === 'all' ? 1 : (currentPage - 1) * itemsPerPage + 1}
                                    </span> to <span className="font-semibold text-slate-700">
                                        {itemsPerPage === 'all' ? filteredTransactions.length : Math.min(currentPage * itemsPerPage, filteredTransactions.length)}
                                    </span> of <span className="font-semibold text-slate-700">{filteredTransactions.length}</span> items
                                </div>
                            </div>

                            {itemsPerPage !== 'all' && filteredTransactions.length > itemsPerPage && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="p-2 text-slate-400 hover:text-accent disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronsLeft size={18} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 text-slate-400 hover:text-accent disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <div className="flex items-center px-2">
                                        <span className="text-sm text-slate-500">
                                            Page <span className="font-semibold text-slate-700">{currentPage}</span> of <span className="font-semibold text-slate-700">{Math.ceil(filteredTransactions.length / itemsPerPage)}</span>
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), prev + 1))}
                                        disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                                        className="p-2 text-slate-400 hover:text-accent disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(Math.ceil(filteredTransactions.length / itemsPerPage))}
                                        disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                                        className="p-2 text-slate-400 hover:text-accent disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronsRight size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                            <Filter size={32} />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 mb-1">No transactions found</h4>
                        <p className="text-slate-500 max-w-xs">
                            Try adjusting your date filters to see transactions from a different period.
                        </p>
                    </div>
                )}
            </div>
        </div >
    );
}
