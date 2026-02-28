import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
    TrendingUp,
    DollarSign,
    LayoutDashboard,
    ArrowRight,
    Info,
    Tag,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    AlertTriangle
} from 'lucide-react';
import {
    BarChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
    LabelList
} from 'recharts';

const InsightCard = ({ title, primaryMsg, subMsg, icon, colorClass, bgClass }) => (
    <div className={`p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-center gap-1.5 ${bgClass || 'bg-white'}`}>
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

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const hoveredItem = payload[0];
        const categoryName = hoveredItem.dataKey || hoveredItem.name;
        const categoryAmount = hoveredItem.value || 0;
        const total = hoveredItem.payload.total || 0;
        const percent = total > 0 ? ((categoryAmount / total) * 100).toFixed(1) : 0;

        return (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-md min-w-[160px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1">{label} · {categoryName}</p>
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-slate-500 font-medium">{categoryName} Spend:</span>
                        <span className="text-sm font-bold text-slate-800">${categoryAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-slate-500 font-medium">% of Total:</span>
                        <span className="text-xs font-bold text-indigo-600">{percent}%</span>
                    </div>
                    <div className="flex justify-between items-center gap-4 pt-1 border-t border-slate-100 mt-1">
                        <span className="text-xs text-slate-500 font-medium">Interval Total:</span>
                        <span className="text-xs font-bold text-slate-700">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

const COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#3b82f6',
    '#84cc16', '#d946ef', '#f43f5e', '#0ea5e9', '#eab308'
];

export default function Overview() {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Top-Level Controls
    const [timeRange, setTimeRange] = useState('30D'); // 30D, 3M, 6M, YTD, 1Y, Custom
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [groupBy, setGroupBy] = useState('Weekly'); // Daily, Weekly, Monthly
    const [focusCategory, setFocusCategory] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [chartPopover, setChartPopover] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    // Close chart popover on outside click
    useEffect(() => {
        const handleClickOutside = () => setChartPopover(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchCategories(), fetchProfile()]);
        setLoading(false);
    };

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('profiles')
                .select('first_name')
                .eq('id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            setProfile(data);
        } catch (err) {
            console.error('Error fetching profile:', err);
        }
    };

    const fetchTransactions = async () => {
        try {
            const { data, error } = await supabase
                .from('silver_transactions')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            setTransactions(data || []);
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
                .select('name')
                .eq('user_id', user.id);

            if (error) throw error;
            setCategories(data?.map(c => c.name) || []);
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    // Calculate effective date range
    const effectiveDateRange = useMemo(() => {
        let start = new Date();
        let end = new Date();

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        if (timeRange === '30D') {
            start.setDate(start.getDate() - 30);
        } else if (timeRange === '3M') {
            start.setMonth(start.getMonth() - 3);
            start.setDate(1); // Usually nice to start at beginning of month for 3M
        } else if (timeRange === '6M') {
            start.setMonth(start.getMonth() - 6);
            start.setDate(1);
        } else if (timeRange === 'YTD') {
            start = new Date(start.getFullYear(), 0, 1);
        } else if (timeRange === '1Y') {
            start.setFullYear(start.getFullYear() - 1);
            start.setDate(1);
        } else if (timeRange === 'Custom') {
            if (customStartDate) start = new Date(customStartDate + 'T00:00:00');
            if (customEndDate) end = new Date(customEndDate + 'T23:59:59');
        }

        return { start, end };
    }, [timeRange, customStartDate, customEndDate]);

    // Filter transactions by date
    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => {
            const txDate = new Date(tx.date + 'T12:00:00'); // Midday to avoid timezone shifting
            return txDate >= effectiveDateRange.start && txDate <= effectiveDateRange.end;
        });
    }, [transactions, effectiveDateRange]);

    // Auto-select category if none
    useEffect(() => {
        if (categories.length > 0 && !selectedCategory) {
            setSelectedCategory(categories[0]);
        }
    }, [categories, selectedCategory]);

    // Bucket data
    const chartData = useMemo(() => {
        const buckets = {};

        filteredTransactions.forEach(tx => {
            // Only care about spending for trends
            if (tx.category === 'Income' || parseFloat(tx.amount) > 0) return;

            const amt = Math.abs(parseFloat(tx.amount));
            const date = new Date(tx.date + 'T12:00:00');
            let bucketKey = '';
            let sortKey = '';

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

            if (!buckets[sortKey]) {
                buckets[sortKey] = { label: bucketKey, sortKey: sortKey, total: 0, count: 0 };
            }

            const cat = tx.category || 'Uncategorized';
            if (!buckets[sortKey][cat]) {
                buckets[sortKey][cat] = 0;
            }

            buckets[sortKey][cat] += amt;
            buckets[sortKey].total += amt;
            buckets[sortKey].count += 1;
        });

        // Convert to array and sort chronologically
        const sortedData = Object.values(buckets).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        // Second pass: Calculate prevTotal, percentage change, and topCategory
        sortedData.forEach((bucket, index) => {
            // Top Category ID
            let topCat = null;
            let topAmt = 0;
            Object.keys(bucket).forEach(k => {
                if (!['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(k)) {
                    if (bucket[k] > topAmt) {
                        topAmt = bucket[k];
                        topCat = k;
                    }
                }
            });
            bucket.topCategory = topCat;

            // Previous interval comparison
            if (index > 0) {
                const prev = sortedData[index - 1].total;
                bucket.prevTotal = prev;
                if (prev > 0) {
                    bucket.pctChange = ((bucket.total - prev) / prev) * 100;
                } else if (bucket.total > 0) {
                    bucket.pctChange = 100;
                } else {
                    bucket.pctChange = 0;
                }
            } else {
                bucket.prevTotal = 0;
                bucket.pctChange = null; // No previous data
            }
        });

        return sortedData;
    }, [filteredTransactions, groupBy]);

    // Collect all active categories for stacked bar (exclude empty ones)
    const activeCategories = useMemo(() => {
        const cats = new Set();
        chartData.forEach(bucket => {
            Object.keys(bucket).forEach(k => {
                if (!['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(k)) {
                    cats.add(k);
                }
            });
        });
        return Array.from(cats);
    }, [chartData]);

    // Calculate dynamic insights based on intervals
    const dynamicInsights = useMemo(() => {
        if (!chartData || chartData.length < 2) return null;

        // Current interval (last item) and Previous interval (second to last)
        const currentData = chartData[chartData.length - 1];
        const previousData = chartData[chartData.length - 2];

        // 1. Spending Trend
        const spendingTrend = currentData.pctChange || 0;

        // 2 & 3. Largest Shifts (Increase and Decrease)
        let maxIncreaseCat = null;
        let maxIncreasePct = -Infinity;
        let maxDecreaseCat = null;
        let maxDecreasePct = Infinity;

        // Compare categories present in both or either
        const allPossibleCats = new Set([...Object.keys(currentData), ...Object.keys(previousData)]);

        allPossibleCats.forEach(cat => {
            if (['label', 'sortKey', 'total', 'count', 'prevTotal', 'pctChange', 'topCategory'].includes(cat)) return;

            const currVal = currentData[cat] || 0;
            const prevVal = previousData[cat] || 0;

            if (prevVal > 0) {
                const pct = ((currVal - prevVal) / prevVal) * 100;
                // Require at least $50 spend to trigger a "major shift" insight to avoid noise
                if (pct > maxIncreasePct && currVal > 50) {
                    maxIncreasePct = pct;
                    maxIncreaseCat = cat;
                }
                if (pct < maxDecreasePct && prevVal > 50) {
                    maxDecreasePct = pct;
                    maxDecreaseCat = cat;
                }
            } else if (currVal > 50) { // New expense this interval
                if (100 > maxIncreasePct) {
                    maxIncreasePct = 100;
                    maxIncreaseCat = cat;
                }
            }
        });

        // 4. Anomaly Detection (e.g. highest spend in historical window)
        let anomalyLabel = "In line with rolling average";
        let anomalyValue = "";
        let anomalyColor = "text-slate-500";
        let anomalyBg = "bg-slate-100/50";

        if (chartData.length >= 3) {
            const history = chartData.slice(0, -1); // Exclude current
            const historicalAvg = history.reduce((sum, b) => sum + b.total, 0) / history.length;
            const highestHistorical = Math.max(...history.map(b => b.total));

            if (currentData.total > highestHistorical) {
                anomalyLabel = `Highest ${groupBy.toLowerCase()} spend`;
                anomalyValue = `in the last ${history.length} intervals`;
                anomalyColor = "text-rose-600";
                anomalyBg = "bg-rose-50";
            } else if (currentData.total > historicalAvg * 1.5) {
                anomalyLabel = "Spending surge detected";
                anomalyValue = `+${Math.round(((currentData.total - historicalAvg) / historicalAvg) * 100)}% vs average`;
                anomalyColor = "text-amber-600";
                anomalyBg = "bg-amber-50";
            } else if (currentData.total < historicalAvg * 0.5 && currentData.total > 0) {
                anomalyLabel = "Unusually low spending";
                anomalyValue = `${Math.round((1 - (currentData.total / historicalAvg)) * 100)}% below average`;
                anomalyColor = "text-emerald-600";
                anomalyBg = "bg-emerald-50";
            }
        }

        return {
            trend: {
                value: spendingTrend,
                label: `vs previous ${groupBy.toLowerCase() === 'daily' ? 'day' : groupBy.toLowerCase().slice(0, -2)}`
            },
            increase: maxIncreaseCat ? {
                category: maxIncreaseCat,
                value: maxIncreasePct,
                label: `vs previous ${groupBy.toLowerCase() === 'daily' ? 'day' : groupBy.toLowerCase().slice(0, -2)}`
            } : null,
            decrease: maxDecreaseCat ? {
                category: maxDecreaseCat,
                value: maxDecreasePct,
                label: `vs previous ${groupBy.toLowerCase() === 'daily' ? 'day' : groupBy.toLowerCase().slice(0, -2)}`
            } : null,
            anomaly: {
                label: anomalyLabel,
                value: anomalyValue,
                color: anomalyColor,
                bg: anomalyBg
            }
        };
    }, [chartData, groupBy]);

    const navigateToAnalysis = (payload, categoryFilter) => {
        if (!payload) return;

        let stateToPass = {};

        if (groupBy === 'Daily') {
            stateToPass = {
                filterType: 'range',
                startDate: payload.sortKey,
                endDate: payload.sortKey
            };
        } else if (groupBy === 'Weekly') {
            stateToPass = {
                filterType: 'week',
                selectedWeek: payload.sortKey // The sortKey is already the Monday YYYY-MM-DD
            };
        } else if (groupBy === 'Monthly') {
            stateToPass = {
                filterType: 'month',
                selectedMonth: payload.sortKey // The sortKey is already YYYY-MM
            };
        }

        if (categoryFilter) {
            stateToPass.category = categoryFilter;
        }

        navigate('/dashboard/analysis', { state: stateToPass });
    };

    const handleChartClick = (data) => {
        if (!data || !data.activePayload || !data.activePayload[0]) return;
        navigateToAnalysis(data.activePayload[0].payload, focusCategory ? selectedCategory : null);
    };

    const handleStackedBarClick = (category, data, e) => {
        if (e && e.stopPropagation) e.stopPropagation();

        setTimeout(() => {
            setChartPopover({
                x: e.clientX,
                y: e.clientY,
                category: category,
                payload: data.payload || data
            });
        }, 0);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="font-medium text-sm">Loading Overview...</p>
                </div>
            </div>
        );
    }

    const firstName = profile?.first_name || 'there';

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex items-end justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial Overview</h1>
                    <p className="text-slate-500">Track spending trends and identify patterns over time.</p>
                </div>
            </header>

            {/* Top-Level Controls */}
            <div className="sticky top-0 z-30 flex flex-col md:flex-row gap-6 bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200 shadow-sm items-center">
                <div className="flex flex-wrap items-center gap-6 w-full">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[320px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Range</label>
                        <div className="flex bg-slate-100/80 p-1 rounded-xl w-full border border-slate-200/50">
                            {['30D', '3M', '6M', 'YTD', '1Y', 'Custom'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${timeRange === range
                                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-900/5'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                        }`}
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
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={e => setCustomStartDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 block w-full p-2 outline-none cursor-text"
                                />
                                <span className="text-slate-400 text-sm font-medium">to</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={e => setCustomEndDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 block w-full p-2 outline-none cursor-text"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5 min-w-[140px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group By</label>
                        <select
                            value={groupBy}
                            onChange={e => setGroupBy(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 block w-full p-2 outline-none cursor-pointer"
                        >
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Monthly">Monthly</option>
                        </select>
                    </div>
                </div>

                <div className="w-full md:w-auto flex md:ml-auto items-center justify-between md:justify-end gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-5 md:pt-0 md:pl-6 shrink-0 h-full">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={focusCategory}
                                onChange={() => setFocusCategory(!focusCategory)}
                            />
                            <div className={`block w-11 h-6 rounded-full transition-all duration-300 ease-in-out ${focusCategory ? 'bg-indigo-500 shadow-inner' : 'bg-slate-200 shadow-inner'}`}></div>
                            <div className={`absolute left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out shadow-sm ${focusCategory ? 'transform translate-x-5' : ''}`}></div>
                        </div>
                        <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Focus on Category</span>
                    </label>

                    {focusCategory && (
                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="bg-indigo-50/50 border border-indigo-200 text-indigo-700 font-bold text-sm rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 block min-w-[160px] p-2 outline-none cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option value="Uncategorized">Uncategorized</option>
                        </select>
                    )}
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {dynamicInsights ? (
                    <>
                        {/* Spending Trend */}
                        <InsightCard
                            title="Spending Trend"
                            icon={<TrendingUp size={12} />}
                            primaryMsg={
                                <>
                                    {dynamicInsights.trend.value > 0 ? <ArrowUpRight size={18} /> : dynamicInsights.trend.value < 0 ? <ArrowDownRight size={18} /> : null}
                                    {Math.abs(dynamicInsights.trend.value).toFixed(1)}%
                                </>
                            }
                            subMsg={dynamicInsights.trend.label}
                            colorClass={dynamicInsights.trend.value > 0 ? "text-rose-600" : dynamicInsights.trend.value < 0 ? "text-emerald-600" : "text-slate-600"}
                        />

                        {/* Largest Increase */}
                        <InsightCard
                            title="Largest Increase"
                            icon={<ArrowUpRight size={12} className="text-rose-500" />}
                            primaryMsg={dynamicInsights.increase ? `${dynamicInsights.increase.category} +${Math.round(dynamicInsights.increase.value)}%` : "No major increases"}
                            subMsg={dynamicInsights.increase ? dynamicInsights.increase.label : " "}
                            colorClass={dynamicInsights.increase ? "text-slate-800" : "text-slate-400"}
                        />

                        {/* Largest Decrease */}
                        <InsightCard
                            title="Largest Decrease"
                            icon={<ArrowDownRight size={12} className="text-emerald-500" />}
                            primaryMsg={dynamicInsights.decrease ? `${dynamicInsights.decrease.category} ${Math.round(dynamicInsights.decrease.value)}%` : "No major decreases"}
                            subMsg={dynamicInsights.decrease ? dynamicInsights.decrease.label : " "}
                            colorClass={dynamicInsights.decrease ? "text-slate-800" : "text-slate-400"}
                        />

                        {/* Anomaly Detection */}
                        <InsightCard
                            title="Anomaly Detection"
                            icon={<Activity size={12} className={dynamicInsights.anomaly.color} />}
                            primaryMsg={dynamicInsights.anomaly.label}
                            subMsg={dynamicInsights.anomaly.value}
                            colorClass={dynamicInsights.anomaly.color}
                            bgClass={dynamicInsights.anomaly.bg}
                        />
                    </>
                ) : (
                    <div className="col-span-1 md:col-span-2 lg:col-span-4 p-6 bg-slate-50 text-slate-400 font-medium text-sm rounded-xl border border-slate-200 text-center flex items-center justify-center gap-2">
                        <Activity size={16} /> Need at least 2 complete intervals to generate comparative insights.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-8">
                {/* Main Trend Chart */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[450px]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Spending Trends</h3>
                            <p className="text-sm text-slate-500">Click on any {groupBy.toLowerCase()} interval to see a detailed breakdown.</p>
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-[350px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                {focusCategory ? (
                                    <BarChart data={chartData} onClick={handleChartClick} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} dy={10} minTickGap={20} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => `$${val}`} width={80} domain={[0, dataMax => Math.round(dataMax * 1.15)]} />
                                        <RechartsTooltip shared={false} cursor={{ fill: '#f8fafc', radius: 4 }} content={<CustomTooltip />} />
                                        <Bar
                                            dataKey={selectedCategory}
                                            fill="#6366f1"
                                            radius={[4, 4, 0, 0]}
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={(data, idx, e) => handleStackedBarClick(selectedCategory, data, e)}
                                        >
                                            <LabelList
                                                dataKey={selectedCategory}
                                                position="top"
                                                formatter={(val) => val > 0 ? `$${Math.round(val)}` : ''}
                                                style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }}
                                            />
                                        </Bar>
                                    </BarChart>
                                ) : (
                                    <BarChart data={chartData} onClick={handleChartClick} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} dy={10} minTickGap={20} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => `$${val}`} width={80} domain={[0, dataMax => Math.round(dataMax * 1.15)]} />
                                        <RechartsTooltip shared={false} cursor={{ fill: '#f8fafc', radius: 6 }} content={<CustomTooltip />} />
                                        <Legend
                                            wrapperStyle={{ paddingTop: '20px' }}
                                            iconType="circle"
                                            formatter={(value) => <span className="text-slate-600 font-medium text-xs ml-1">{value}</span>}
                                        />
                                        {activeCategories.map((cat, index) => (
                                            <Bar
                                                key={cat}
                                                dataKey={cat}
                                                stackId="a"
                                                fill={COLORS[categories.indexOf(cat) !== -1 ? categories.indexOf(cat) % COLORS.length : index % COLORS.length]}
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                                radius={index === activeCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                                onClick={(data, idx, e) => handleStackedBarClick(cat, data, e)}
                                            />
                                        ))}
                                        {/* Invisible Line tracking the total sum to perfectly anchor and horizontally center the total labels */}
                                        <Line dataKey="total" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false}>
                                            <LabelList
                                                dataKey="total"
                                                position="top"
                                                offset={8}
                                                formatter={(val) => val > 0 ? `$${Math.round(val)}` : ''}
                                                style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }}
                                            />
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
                    </div>
                </div>
            </div>

            {/* Compressed Pro Tip at bottom */}
            <div className="bg-indigo-50/30 border border-indigo-100/50 p-4 rounded-xl flex items-center gap-4 shadow-sm">
                <Info className="text-indigo-400 shrink-0" size={18} />
                <p className="text-indigo-900/60 text-xs font-medium">
                    Pro Tip: Update <button onClick={() => navigate('/dashboard/categories')} className="font-bold underline hover:text-indigo-700">Categories</button>
                    and <button onClick={() => navigate('/dashboard/rules')} className="font-bold underline hover:text-indigo-700">Rules</button>
                    to customize how your transactions are sorted.
                </p>
            </div>

            {/* Click Action Popover */}
            {chartPopover && (
                <div
                    className="fixed z-[100] bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-1.5 min-w-[200px] animate-in zoom-in-95 duration-200"
                    style={{ top: Math.min(chartPopover.y, window.innerHeight - 150), left: Math.min(chartPopover.x, window.innerWidth - 220) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">
                        {chartPopover.payload.label}
                    </div>
                    {focusCategory ? (
                        <button
                            className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors flex items-center gap-2.5"
                            onClick={() => {
                                setFocusCategory(false);
                                setChartPopover(null);
                            }}
                        >
                            <LayoutDashboard size={16} className="text-slate-400" />
                            View All Categories
                        </button>
                    ) : (
                        <button
                            className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors flex items-center gap-2.5"
                            onClick={() => {
                                setFocusCategory(true);
                                setSelectedCategory(chartPopover.category);
                                setChartPopover(null);
                            }}
                        >
                            <Tag size={16} className={chartPopover.category ? "text-indigo-500" : "text-slate-400"} />
                            Focus on {chartPopover.category}
                        </button>
                    )}
                    <button
                        className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2.5"
                        onClick={() => {
                            navigateToAnalysis(chartPopover.payload, chartPopover.category);
                            setChartPopover(null);
                        }}
                    >
                        <ArrowRight size={16} className="text-slate-400" />
                        View Breakdown
                    </button>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, icon, trend }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
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
