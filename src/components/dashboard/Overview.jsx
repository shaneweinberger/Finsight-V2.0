import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { CATEGORY_COLORS } from '../../lib/categoryColors';
import { theme } from '../../theme';
import { useSessionState } from '../../hooks/useSessionState';
import {
    TrendingUp,
    LayoutDashboard,
    Info,
    Tag,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    X,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    LabelList,
} from 'recharts';

// ─── Insight card ──────────────────────────────────────────────────────────────
const InsightCard = ({ title, primaryMsg, subMsg, icon, colorClass, bgClass }) => (
    <div className={`p-4 rounded-xl border border-divider shadow-sm flex flex-col justify-center gap-1.5 ${bgClass || 'bg-surface-card'}`}>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {icon}
            {title}
        </div>
        <div className={`text-base font-extrabold flex items-center gap-1.5 ${colorClass}`}>
            {primaryMsg}
        </div>
        {subMsg && <div className="text-xs font-medium text-slate-500">{subMsg}</div>}
    </div>
);

// ─── Lightweight hover tooltip (suppressed when locked) ───────────────────────
function makeHoverTooltip(lockedRef) {
    return function HoverTooltip({ active, payload, label }) {
        if (lockedRef.current) return null;        // suppress while locked
        if (!active || !payload?.length) return null;
        const item = payload[0];
        const catName = item.name || item.dataKey;
        const amount = item.value || 0;
        const total = item.payload?.total || 0;
        const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
        const ht = theme.trendsGraph.hoverTooltip;
        return (
            <div
                className="px-3 py-2.5 rounded-xl pointer-events-none min-w-[160px]"
                style={{
                    backgroundColor: ht.background,
                    border: `1px solid ${ht.border}`,
                    boxShadow: ht.shadow,
                }}
            >
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: ht.labelColor }}>{label}</p>
                <p className="text-sm font-bold" style={{ color: ht.categoryColor }}>{catName}</p>
                <div className="flex items-center justify-between gap-4 mt-1">
                    <span className="text-xs" style={{ color: ht.amountColor }}>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-xs font-semibold" style={{ color: ht.percentColor }}>{pct}%</span>
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: ht.hintColor }}>Click to see actions</p>
            </div>
        );
    };
}

const DEFAULT_VISIBLE_CATEGORIES = 5;

export default function Overview() {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Top-Level Controls — persisted across in-app navigation via sessionStorage
    const [timeRange, setTimeRange] = useSessionState('overview.timeRange', '30D');
    const [customStartDate, setCustomStartDate] = useSessionState('overview.customStartDate', (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    })());
    const [customEndDate, setCustomEndDate] = useSessionState('overview.customEndDate', new Date().toISOString().split('T')[0]);
    const [groupBy, setGroupBy] = useSessionState('overview.groupBy', 'Weekly');
    // Ephemeral interaction state — intentionally NOT persisted
    const [focusCategory, setFocusCategory] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('');

    // ── Locked tooltip (replaces chartPopover) ─────────────────────────────────
    const [lockedTooltip, setLockedTooltip] = useState(null); // { category, payload, x, y }
    const lockedTooltipRef = useRef(null);
    lockedTooltipRef.current = lockedTooltip;
    const chartContainerRef = useRef(null);

    // Memoised hover tooltip component that captures lockedTooltipRef
    const HoverTooltip = useMemo(() => makeHoverTooltip(lockedTooltipRef), []);

    // ── Pill drag state ────────────────────────────────────────────────────────
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // ── Effects ────────────────────────────────────────────────────────────────
    useEffect(() => { fetchData(); }, []);

    // Close locked tooltip on outside click
    useEffect(() => {
        const close = () => setLockedTooltip(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    // Close on Esc
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') setLockedTooltip(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Data fetching ──────────────────────────────────────────────────────────
    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchCategories(), fetchProfile()]);
        setLoading(false);
    };

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase.from('profiles').select('first_name').eq('id', user.id).single();
            if (error && error.code !== 'PGRST116') throw error;
            setProfile(data);
        } catch (err) { console.error('Error fetching profile:', err); }
    };

    const fetchTransactions = async () => {
        try {
            const { data, error } = await supabase.from('silver_transactions').select('*').order('date', { ascending: false });
            if (error) throw error;
            setTransactions(data || []);
        } catch (err) { console.error('Error fetching transactions:', err); }
    };

    const fetchCategories = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase.from('user_categories').select('name, color').eq('user_id', user.id);
            if (error) throw error;
            setCategories(data || []);
        } catch (err) { console.error('Error fetching categories:', err); }
    };

    // ── Date range ─────────────────────────────────────────────────────────────
    const effectiveDateRange = useMemo(() => {
        let start = new Date(), end = new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (timeRange === '30D') { start.setDate(start.getDate() - 30); }
        else if (timeRange === '3M') { start.setMonth(start.getMonth() - 3); start.setDate(1); }
        else if (timeRange === '6M') { start.setMonth(start.getMonth() - 6); start.setDate(1); }
        else if (timeRange === 'YTD') { start = new Date(start.getFullYear(), 0, 1); }
        else if (timeRange === '1Y') { start.setFullYear(start.getFullYear() - 1); start.setDate(1); }
        else if (timeRange === 'Custom') {
            if (customStartDate) start = new Date(customStartDate + 'T00:00:00');
            if (customEndDate) end = new Date(customEndDate + 'T23:59:59');
        }
        return { start, end };
    }, [timeRange, customStartDate, customEndDate]);

    const filteredTransactions = useMemo(() => (
        transactions.filter(tx => {
            const txDate = new Date(tx.date + 'T12:00:00');
            return txDate >= effectiveDateRange.start && txDate <= effectiveDateRange.end;
        })
    ), [transactions, effectiveDateRange]);

    // ── Category helpers ───────────────────────────────────────────────────────
    const categoryNames = categories.map(c => c.name);

    useEffect(() => {
        if (categoryNames.length > 0 && !selectedCategory) setSelectedCategory(categoryNames[0]);
    }, [categoryNames, selectedCategory]);

    // ── Chart data ─────────────────────────────────────────────────────────────
    const chartData = useMemo(() => {
        const buckets = {};
        filteredTransactions.forEach(tx => {
            // Skip Income-categorised transactions entirely
            if (tx.category === 'Income') return;
            // Net contribution: outflows (negative amount) contribute positively,
            // inflows (positive amount) reduce the bucket — matching the category breakdown table.
            const signed = parseFloat(tx.amount);
            const contribution = -signed; // outflow(-) → positive, inflow(+) → negative
            const date = new Date(tx.date + 'T12:00:00');
            let bucketKey = '', sortKey = '';
            if (groupBy === 'Daily') {
                bucketKey = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                sortKey = tx.date;
            } else if (groupBy === 'Weekly') {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                bucketKey = `Week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                sortKey = monday.toISOString().split('T')[0];
            } else if (groupBy === 'Monthly') {
                bucketKey = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }
            if (!buckets[sortKey]) buckets[sortKey] = { label: bucketKey, sortKey, total: 0, count: 0 };
            const cat = tx.category || 'Uncategorized';
            buckets[sortKey][cat] = (buckets[sortKey][cat] || 0) + contribution;
            buckets[sortKey].total += contribution;
            buckets[sortKey].count += 1;
        });
        const sortedData = Object.values(buckets).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        sortedData.forEach((bucket, index) => {
            let topCat = null, topAmt = 0;
            Object.keys(bucket).forEach(k => {
                if (!['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(k) && bucket[k] > topAmt) {
                    topAmt = bucket[k]; topCat = k;
                }
            });
            bucket.topCategory = topCat;
            if (index > 0) {
                const prev = sortedData[index - 1].total;
                bucket.prevTotal = prev;
                bucket.pctChange = prev > 0 ? ((bucket.total - prev) / prev) * 100 : bucket.total > 0 ? 100 : 0;
            } else { bucket.prevTotal = 0; bucket.pctChange = null; }
        });
        return sortedData;
    }, [filteredTransactions, groupBy]);

    const categoryTotals = useMemo(() => {
        const totals = {};
        chartData.forEach(bucket => {
            Object.keys(bucket).forEach(k => {
                if (!['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(k)) {
                    totals[k] = (totals[k] || 0) + bucket[k];
                }
            });
        });
        // Exclude categories whose net across the period is zero or negative
        // (they had at least as much inflow as outflow — no meaningful spend to show)
        return Object.entries(totals)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
    }, [chartData]);

    const defaultCategories = useMemo(() => categoryTotals.slice(0, DEFAULT_VISIBLE_CATEGORIES).map(c => c[0]), [categoryTotals]);

    const [userSelectedCategories, setUserSelectedCategories] = useState(null);

    useEffect(() => { setUserSelectedCategories(null); }, [effectiveDateRange]);

    const activeVisibleCategories = useMemo(() => (
        userSelectedCategories !== null ? userSelectedCategories : defaultCategories
    ), [userSelectedCategories, defaultCategories]);

    const remainingCount = categoryTotals.length - activeVisibleCategories.length;

    const presentationChartData = useMemo(() => {
        const activeSet = new Set(activeVisibleCategories);
        return chartData.map(bucket => {
            const nb = { ...bucket };
            let remainingSum = 0;
            Object.keys(bucket).forEach(k => {
                if (!['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(k)) {
                    if (activeSet.has(k)) {
                        // Clamp net-negative category values to 0 (inflows cancelled out the outflows)
                        nb[k] = Math.max(0, bucket[k] || 0);
                    } else {
                        remainingSum += Math.max(0, bucket[k] || 0);
                        delete nb[k];
                    }
                }
            });
            // Clamp the total used for bar labels too
            nb.total = Math.max(0, bucket.total || 0);
            // Always include 'remaining' key (even if 0) so the Bar stays mounted and stacking is stable
            nb['remaining'] = remainingSum;
            return nb;
        });
    }, [chartData, activeVisibleCategories, categoryTotals.length]);

    const toggleCategoryVisibility = (catName) => {
        const current = userSelectedCategories !== null ? userSelectedCategories : defaultCategories;
        setUserSelectedCategories(
            current.includes(catName)
                ? current.filter(c => c !== catName)
                : [...current, catName]
        );
    };

    const getColorForCategory = (catName, fallbackIndex = 0) => {
        if (catName === 'remaining') return '#c7c2c22d';
        const cat = categories.find(c => c.name === catName);
        if (cat?.color) return cat.color;
        const idx = categoryNames.indexOf(catName);
        return CATEGORY_COLORS[idx !== -1 ? idx % CATEGORY_COLORS.length : fallbackIndex % CATEGORY_COLORS.length];
    };

    // ── Dynamic insights ───────────────────────────────────────────────────────
    const dynamicInsights = useMemo(() => {
        if (!chartData || chartData.length < 2) return null;
        const currentData = chartData[chartData.length - 1];
        const previousData = chartData[chartData.length - 2];
        const spendingTrend = currentData.pctChange || 0;
        let maxIncreaseCat = null, maxIncreasePct = -Infinity;
        let maxDecreaseCat = null, maxDecreasePct = Infinity;
        const allCats = new Set([...Object.keys(currentData), ...Object.keys(previousData)]);
        allCats.forEach(cat => {
            if (['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(cat)) return;
            const currVal = currentData[cat] || 0;
            const prevVal = previousData[cat] || 0;
            if (prevVal > 0) {
                const pct = ((currVal - prevVal) / prevVal) * 100;
                if (pct > maxIncreasePct && currVal > 50) { maxIncreasePct = pct; maxIncreaseCat = cat; }
                if (pct < maxDecreasePct && prevVal > 50) { maxDecreasePct = pct; maxDecreaseCat = cat; }
            }
        });
        const history = chartData.slice(0, -1);
        const historicalAvg = history.reduce((s, b) => s + b.total, 0) / history.length;

        let anomalyLabel = 'Normal spending pattern', anomalyValue = 'No unusual activity detected';
        let anomalyColor = 'text-slate-500', anomalyBg = '';
        if (currentData.total === Math.max(...chartData.map(b => b.total))) {
            anomalyLabel = `Highest ${groupBy.toLowerCase()} spend`;
            anomalyValue = `in the last ${history.length} intervals`;
            anomalyColor = 'text-rose-600'; anomalyBg = 'bg-rose-50';
        } else if (currentData.total > historicalAvg * 1.5) {
            anomalyLabel = 'Spending surge detected';
            anomalyValue = `+${Math.round(((currentData.total - historicalAvg) / historicalAvg) * 100)}% vs average`;
            anomalyColor = 'text-amber-600'; anomalyBg = 'bg-amber-50';
        } else if (currentData.total < historicalAvg * 0.5 && currentData.total > 0) {
            anomalyLabel = 'Unusually low spending';
            anomalyValue = `${Math.round((1 - currentData.total / historicalAvg) * 100)}% below average`;
            anomalyColor = 'text-emerald-600'; anomalyBg = 'bg-emerald-50';
        }

        const intervalWord = groupBy.toLowerCase() === 'daily' ? 'day' : groupBy.toLowerCase().slice(0, -2);
        return {
            trend: { value: spendingTrend, label: `vs previous ${intervalWord}` },
            increase: maxIncreaseCat ? { category: maxIncreaseCat, value: maxIncreasePct, label: `vs previous ${intervalWord}` } : null,
            decrease: maxDecreaseCat ? { category: maxDecreaseCat, value: maxDecreasePct, label: `vs previous ${intervalWord}` } : null,
            average: { label: `Historical ${intervalWord}ly average`, value: historicalAvg },
            anomaly: { label: anomalyLabel, value: anomalyValue, color: anomalyColor, bg: anomalyBg },
        };
    }, [chartData, groupBy]);

    // ── Navigation ─────────────────────────────────────────────────────────────
    const navigateToAnalysis = useCallback((payload, categoryFilter) => {
        if (!payload) return;
        let stateToPass = {};
        if (groupBy === 'Daily') stateToPass = { filterType: 'range', startDate: payload.sortKey, endDate: payload.sortKey };
        else if (groupBy === 'Weekly') stateToPass = { filterType: 'week', selectedWeek: payload.sortKey };
        else if (groupBy === 'Monthly') stateToPass = { filterType: 'month', selectedMonth: payload.sortKey };
        if (categoryFilter) stateToPass.category = categoryFilter;
        navigate('/dashboard/analysis', { state: stateToPass });
    }, [groupBy, navigate]);

    // ── Bar click → locked tooltip ────────────────────────────────────────────
    const handleBarClick = useCallback((category, barData, event) => {
        if (event?.stopPropagation) event.stopPropagation();
        const rect = chartContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Position relative to the chart container
        const x = (event.clientX || 0) - rect.left;
        const y = (event.clientY || 0) - rect.top;
        setLockedTooltip({ category, payload: barData?.payload || barData, x, y });
    }, []);

    // ── Pill drag handlers ─────────────────────────────────────────────────────
    const handlePillDragStart = (e, index) => {
        e.dataTransfer.effectAllowed = 'move';
        setDragIndex(index);
    };

    const handlePillDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    };

    const handlePillDrop = (e, dropIdx) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === dropIdx) { setDragIndex(null); setDragOverIndex(null); return; }
        const current = [...(userSelectedCategories !== null ? userSelectedCategories : defaultCategories)];
        const dragged = current[dragIndex];
        current.splice(dragIndex, 1);
        current.splice(dropIdx, 0, dragged);
        setUserSelectedCategories(current);
        setDragIndex(null);
        setDragOverIndex(null);
    };

    const handlePillDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

    // ── Loading state ──────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="font-medium text-sm">Loading Overview...</p>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex items-end justify-between gap-4 flex-wrap pl-2">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial Overview</h1>
                    <p className="text-slate-500">Track spending trends and identify patterns over time.</p>
                </div>
            </header>

            {/* ── Empty state — no transactions yet ───────────────────────── */}
            {transactions.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-8 py-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Hero message */}
                    <div className="text-center max-w-2xl">
                        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
                            <LayoutDashboard size={32} className="text-accent opacity-70" />
                        </div>
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
                            Welcome {profile?.first_name ? `${profile.first_name} ` : ''}— let's get your finances set up
                        </h2>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            You don't have any transactions yet. Follow these two steps to get started.
                        </p>
                    </div>

                    {/* Two action cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                        {/* Step 1 — AI Processing */}
                        <button
                            onClick={() => navigate('/dashboard/ai-processing')}
                            className="group text-left p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-accent hover:shadow-md transition-all duration-200"
                        >
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <Activity size={20} className="text-accent" />
                            </div>
                            <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Step 1</div>
                            <h3 className="text-base font-extrabold text-slate-900 mb-1">Configure Categories & Rules</h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Set up your spending categories and AI rules so transactions are automatically sorted when processed.
                            </p>
                            <div className="mt-4 text-xs font-bold text-accent flex items-center gap-1 group-hover:gap-2 transition-all">
                                Go to AI Processing <ArrowUpRight size={12} />
                            </div>
                        </button>

                        {/* Step 2 — Upload */}
                        <button
                            onClick={() => navigate('/dashboard/processing')}
                            className="group text-left p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-accent hover:shadow-md transition-all duration-200"
                        >
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <ArrowUpRight size={20} className="text-accent" />
                            </div>
                            <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Step 2</div>
                            <h3 className="text-base font-extrabold text-slate-900 mb-1">Upload & Process Transactions</h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Import a CSV from your bank and run AI processing to categorize and clean your transaction data.
                            </p>
                            <div className="mt-4 text-xs font-bold text-accent flex items-center gap-1 group-hover:gap-2 transition-all">
                                Go to Uploads <ArrowUpRight size={12} />
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main overview content (hidden until transactions exist) ──── */}
            {transactions.length > 0 && (<>
                {/* ── Top-Level Controls ──────────────────────────────────────── */}
                <div className="sticky top-0 z-20 flex flex-col md:flex-row gap-6 px-2 py-1 items-center">
                    <div className="flex flex-wrap items-center gap-6 w-full">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-[320px]">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Range</label>
                            <div className="flex bg-slate-100/80 p-1 rounded-xl w-full border border-slate-200/50">
                                {['30D', '3M', '6M', 'YTD', '1Y', 'Custom'].map(range => (
                                    <button
                                        key={range}
                                        onClick={() => setTimeRange(range)}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${timeRange === range
                                            ? 'bg-white text-accent-light-text shadow-sm ring-1 ring-slate-900/5'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {timeRange === 'Custom' && (
                            <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Custom Dates</label>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-accent-ring focus:border-accent-border block w-full p-2 outline-none cursor-text" />
                                    <span className="text-slate-400 text-sm font-medium">to</span>
                                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-accent-ring focus:border-accent-border block w-full p-2 outline-none cursor-text" />
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-1.5 min-w-[140px]">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group By</label>
                            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-accent-ring focus:border-accent-border block w-full p-2 outline-none cursor-pointer">
                                <option value="Daily">Daily</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Monthly">Monthly</option>
                            </select>
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex md:ml-auto items-center justify-between md:justify-end gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-5 md:pt-[22px] md:pl-6 shrink-0 h-full">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" className="sr-only" checked={focusCategory} onChange={() => setFocusCategory(!focusCategory)} />
                                <div className={`block w-11 h-6 rounded-full transition-all duration-300 ease-in-out ${focusCategory ? 'bg-accent shadow-inner' : 'bg-slate-200 shadow-inner'}`} />
                                <div className={`absolute left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out shadow-sm ${focusCategory ? 'transform translate-x-5' : ''}`} />
                            </div>
                            <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Focus on Category</span>
                        </label>

                        {focusCategory && (
                            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                                className="bg-accent-light/50 border border-accent-ring text-accent-light-text font-bold text-sm rounded-xl focus:ring-2 focus:ring-accent-ring focus:border-accent-border block min-w-[160px] p-2 outline-none cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300">
                                {categoryNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                <option value="Uncategorized">Uncategorized</option>
                            </select>
                        )}
                    </div>
                </div>

                {/* ── Spending Trends + Insight Cards Side-by-Side ────────────── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">
                    {/* Chart card */}
                    <div className="bg-surface-card p-6 rounded-2xl border border-divider shadow-sm flex flex-col min-h-[450px]">

                        {/* Chart header + draggable pill row */}
                        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Spending Trends</h3>
                                <p className="text-sm text-slate-500">
                                    {focusCategory
                                        ? 'Click a bar to see details and actions.'
                                        : 'Drag pills to reorder stack. Click a segment to see details.'}
                                </p>
                            </div>

                            {!focusCategory && (
                                <div className="flex flex-wrap items-center gap-2 max-w-full">
                                    {activeVisibleCategories.map((cat, idx) => (
                                        <React.Fragment key={cat}>
                                            {/* Insertion line — shown BEFORE the drop target */}
                                            {dragIndex !== null && dragOverIndex === idx && dragIndex !== idx && (
                                                <div className="w-0.5 h-6 bg-accent rounded-full shrink-0 animate-in fade-in duration-100" />
                                            )}
                                            <div
                                                draggable
                                                onDragStart={(e) => handlePillDragStart(e, idx)}
                                                onDragOver={(e) => handlePillDragOver(e, idx)}
                                                onDrop={(e) => handlePillDrop(e, idx)}
                                                onDragEnd={handlePillDragEnd}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm text-xs font-bold text-slate-700 cursor-grab active:cursor-grabbing select-none transition-all duration-150 ${dragIndex === idx
                                                    ? 'opacity-40 scale-95 bg-slate-100 border-slate-300'
                                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorForCategory(cat, idx) }} />
                                                {cat}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleCategoryVisibility(cat); }}
                                                    className="ml-0.5 text-slate-400 hover:text-slate-700 transition-colors"
                                                    onMouseDown={e => e.stopPropagation()}
                                                >
                                                    <X size={12} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </React.Fragment>
                                    ))}

                                    {remainingCount > 0 && (
                                        <div className="relative flex items-center group">
                                            <div className="absolute left-3 w-2.5 h-2.5 rounded-full z-10 pointer-events-none" style={{ backgroundColor: getColorForCategory('remaining') }} />
                                            <select
                                                className="appearance-none bg-white border border-dashed border-slate-300 text-slate-500 hover:text-accent hover:border-accent-border hover:bg-white font-bold text-xs rounded-full pl-7 pr-7 py-1.5 outline-none cursor-pointer transition-all shadow-sm"
                                                value=""
                                                onChange={e => { if (e.target.value) toggleCategoryVisibility(e.target.value); }}
                                            >
                                                <option value="" disabled>Remaining ({remainingCount})</option>
                                                {categoryTotals.filter(c => !activeVisibleCategories.includes(c[0])).map(c => (
                                                    <option key={c[0]} value={c[0]}>+ Add {c[0]}</option>
                                                ))}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 group-hover:text-accent">
                                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Chart area — position:relative so locked card is anchored */}
                        <div className="w-full h-[380px] relative" ref={chartContainerRef}>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    {focusCategory ? (
                                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.chart.gridline} />
                                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.chart.axisLabel, fontSize: 11, fontWeight: 500 }} dy={10} minTickGap={20} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: theme.chart.axisLabel, fontSize: 11, fontWeight: 500 }} tickFormatter={val => `$${val}`} width={80} domain={[0, dataMax => Math.round(dataMax * 1.15)]} />
                                            <RechartsTooltip shared={false} cursor={{ fill: theme.chart.cursorFill, radius: 4 }} content={<HoverTooltip />} />
                                            <Bar
                                                dataKey={selectedCategory}
                                                fill={getColorForCategory(selectedCategory)}
                                                radius={[6, 6, 0, 0]}
                                                className="cursor-pointer"
                                                onClick={(data, idx, e) => handleBarClick(selectedCategory, data, e)}
                                            >
                                                <LabelList dataKey={selectedCategory} position="top"
                                                    formatter={val => val > 0 ? `$${Math.round(val)}` : ''}
                                                    style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }} />
                                            </Bar>
                                        </BarChart>
                                    ) : (
                                        <BarChart data={presentationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.chart.gridline} />
                                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.chart.axisLabel, fontSize: 11, fontWeight: 500 }} dy={10} minTickGap={20} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: theme.chart.axisLabel, fontSize: 11, fontWeight: 500 }} tickFormatter={val => `$${val}`} width={80} domain={[0, dataMax => Math.round(dataMax * 1.15)]} />
                                            <RechartsTooltip shared={false} cursor={{ fill: theme.chart.cursorFill, radius: 6 }} content={<HoverTooltip />} />
                                            {activeVisibleCategories.map((cat, index) => {
                                                // last user-category bar = topmost when no remaining
                                                const isTop = remainingCount === 0 && index === activeVisibleCategories.length - 1;
                                                return (
                                                    <Bar key={cat} dataKey={cat} stackId="a"
                                                        fill={getColorForCategory(cat, index)}
                                                        className="cursor-pointer"
                                                        radius={isTop ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                                                        onClick={(data, idx, e) => handleBarClick(cat, data, e)}
                                                    />
                                                );
                                            })}
                                            {/* Always rendered LAST → permanently at top of stack. Never conditionally unmounted. */}
                                            <Bar key="remaining" dataKey="remaining"
                                                name={`Remaining ${remainingCount} categor${remainingCount === 1 ? 'y' : 'ies'}`}
                                                stackId="a" fill={getColorForCategory('remaining')}
                                                className={remainingCount > 0 ? 'cursor-pointer' : ''}
                                                radius={remainingCount > 0 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                                                onClick={remainingCount > 0 ? (data, idx, e) => handleBarClick('Remaining', data, e) : undefined}
                                            />
                                            <Line dataKey="total" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false}>
                                                <LabelList dataKey="total" position="top" offset={8}
                                                    formatter={val => val > 0 ? `$${Math.round(val)}` : ''}
                                                    style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }} />
                                            </Line>
                                        </BarChart>
                                    )}
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                    <LayoutDashboard size={40} strokeWidth={1.5} className="mb-3 opacity-20" />
                                    <p className="text-sm font-medium">No spending data for this period</p>
                                </div>
                            )}

                            {/* ── Locked expanded card (anchored in chart) ───────── */}
                            {lockedTooltip && (
                                <div
                                    className="absolute z-50 pointer-events-auto"
                                    style={{
                                        left: Math.min(lockedTooltip.x, (chartContainerRef.current?.offsetWidth || 400) - 210),
                                        top: Math.max(lockedTooltip.y - 12, 0),
                                        transform: 'translate(-50%, -100%)',
                                    }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="bg-surface-card rounded-2xl border border-divider shadow-xl shadow-slate-200/60 w-52 overflow-hidden animate-in zoom-in-95 fade-in duration-150">
                                        {/* Header */}
                                        <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {lockedTooltip.category !== 'Remaining' && (
                                                    <div className="w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: getColorForCategory(lockedTooltip.category) }} />
                                                )}
                                                <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{lockedTooltip.category}</span>
                                            </div>
                                            <button onClick={() => setLockedTooltip(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                                                <X size={13} />
                                            </button>
                                        </div>
                                        {/* Stats */}
                                        <div className="px-4 py-2.5 space-y-1">
                                            {(() => {
                                                const cat = lockedTooltip.category;
                                                const payload = lockedTooltip.payload || {};
                                                // Recharts Bar onClick gives us the full payload object
                                                const amount = payload[cat] ?? 0;
                                                const total = payload.total || 0;
                                                const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
                                                const label = payload.label || '';
                                                return (
                                                    <>
                                                        <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-slate-500">Spend</span>
                                                            <span className="text-sm font-bold text-slate-800">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-slate-500">% of total</span>
                                                            <span className="text-xs font-bold text-accent">{pct}%</span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        {/* Action buttons */}
                                        <div className="px-2 pb-2 space-y-0.5">
                                            {lockedTooltip.category !== 'Remaining' && !focusCategory && (
                                                <button
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-accent-light hover:text-accent-light-text rounded-xl transition-colors flex items-center gap-2"
                                                    onClick={() => {
                                                        setFocusCategory(true);
                                                        setSelectedCategory(lockedTooltip.category);
                                                        setLockedTooltip(null);
                                                    }}
                                                >
                                                    <Tag size={13} className="text-accent" />
                                                    Focus on Category
                                                </button>
                                            )}
                                            {focusCategory && (
                                                <button
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2"
                                                    onClick={() => { setFocusCategory(false); setLockedTooltip(null); }}
                                                >
                                                    <LayoutDashboard size={13} className="text-slate-400" />
                                                    View All Categories
                                                </button>
                                            )}
                                            <button
                                                className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2"
                                                onClick={() => {
                                                    navigateToAnalysis(lockedTooltip.payload, lockedTooltip.category !== 'Remaining' ? lockedTooltip.category : null);
                                                    setLockedTooltip(null);
                                                }}
                                            >
                                                <ArrowUpRight size={13} className="text-slate-400" />
                                                View Breakdown
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Insight cards — vertical stack beside chart */}
                    <div className="flex flex-col gap-3">
                        {dynamicInsights ? (
                            <>
                                <InsightCard title="Spending Trend" icon={<TrendingUp size={12} />}
                                    primaryMsg={<>{dynamicInsights.trend.value > 0 ? <ArrowUpRight size={18} /> : dynamicInsights.trend.value < 0 ? <ArrowDownRight size={18} /> : null}{Math.abs(dynamicInsights.trend.value).toFixed(1)}%</>}
                                    subMsg={dynamicInsights.trend.label}
                                    colorClass={dynamicInsights.trend.value > 0 ? 'text-rose-600' : dynamicInsights.trend.value < 0 ? 'text-emerald-600' : 'text-slate-600'} />
                                <InsightCard title="Largest Increase" icon={<ArrowUpRight size={12} className="text-rose-500" />}
                                    primaryMsg={dynamicInsights.increase ? `${dynamicInsights.increase.category} +${Math.round(dynamicInsights.increase.value)}%` : 'No major increases'}
                                    subMsg={dynamicInsights.increase ? dynamicInsights.increase.label : ' '}
                                    colorClass={dynamicInsights.increase ? 'text-slate-800' : 'text-slate-400'} />
                                <InsightCard title="Largest Decrease" icon={<ArrowDownRight size={12} className="text-emerald-500" />}
                                    primaryMsg={dynamicInsights.decrease ? `${dynamicInsights.decrease.category} ${Math.round(dynamicInsights.decrease.value)}%` : 'No major decreases'}
                                    subMsg={dynamicInsights.decrease ? dynamicInsights.decrease.label : ' '}
                                    colorClass={dynamicInsights.decrease ? 'text-slate-800' : 'text-slate-400'} />
                                <InsightCard title="Average Spend" icon={<Activity size={12} className="text-indigo-500" />}
                                    primaryMsg={`$${Math.round(dynamicInsights.average.value).toLocaleString()}`} subMsg={dynamicInsights.average.label}
                                    colorClass="text-slate-800" />
                                <InsightCard title="Anomaly Detection" icon={<Activity size={12} className={dynamicInsights.anomaly.color} />}
                                    primaryMsg={dynamicInsights.anomaly.label} subMsg={dynamicInsights.anomaly.value}
                                    colorClass={dynamicInsights.anomaly.color} bgClass={dynamicInsights.anomaly.bg} />
                            </>
                        ) : (
                            <div className="p-4 bg-slate-50 text-slate-400 font-medium text-xs rounded-xl border border-slate-200 text-center">
                                Need at least 2 intervals for insights.
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Pro Tip ──────────────────────────────────────────────────── */}
                <div className="bg-accent-light/30 border border-accent-light/50 p-4 rounded-xl flex items-center gap-4 shadow-sm">
                    <Info className="text-accent shrink-0" size={18} />
                    <p className="text-accent-light-text/60 text-xs font-medium">
                        Pro Tip: Update <button onClick={() => navigate('/dashboard/ai-processing')} className="font-bold underline hover:text-accent-light-text">Categories &amp; Rules</button> to customize how your transactions are sorted.
                    </p>
                </div>
            </>)}
        </div>
    );
}

function StatCard({ title, value, icon, trend }) {
    return (
        <div className="bg-surface-card p-6 rounded-2xl border border-divider shadow-sm transition-all hover:shadow-md">
            <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shadow-sm border border-slate-100">
                    {icon}
                </div>
                <div className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                    {trend}
                </div>
            </div>
            <h4 className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">{title}</h4>
            <div className="text-3xl font-black text-slate-900 mt-1 tracking-tight">{value}</div>
        </div>
    );
}

