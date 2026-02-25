
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    DollarSign,
    Calendar,
    Tag,
    Edit2,
    Check,
    X,
    Loader2,
    PieChart as PieChartIcon,
    ArrowRight,
    Info,
    LayoutDashboard
} from 'lucide-react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

import TransactionTable from './TransactionTable';

export default function Overview() {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ description: '', category: '' });

    const onEditChange = (field, value) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        fetchData();
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

    const handleEditStart = (tx) => {
        setEditingId(tx.id);
        setEditForm({ description: tx.description, category: tx.category });
    };

    const handleEditCancel = () => {
        setEditingId(null);
    };

    const handleEditSave = async (id) => {
        try {
            const { error } = await supabase
                .from('silver_transactions')
                .update({
                    description: editForm.description,
                    category: editForm.category,
                    is_edited: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            setTransactions(prev => prev.map(t =>
                t.id === id ? { ...t, ...editForm, is_edited: true } : t
            ));
            setEditingId(null);
        } catch (err) {
            console.error('Error updating transaction:', err);
        }
    };

    // Filter logic for current month
    const now = new Date();
    const currentMonthTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getUTCMonth() === now.getUTCMonth() && txDate.getUTCFullYear() === now.getUTCFullYear();
    });

    const categoryData = currentMonthTransactions.reduce((acc, tx) => {
        // Only count spending (negative amounts) for category chart
        if (parseFloat(tx.amount) >= 0) return acc;

        const found = acc.find(item => item.name === tx.category);
        const amount = Math.abs(parseFloat(tx.amount));
        if (found) {
            found.value += amount;
        } else {
            acc.push({ name: tx.category || 'Uncategorized', value: amount });
        }
        return acc;
    }, []).sort((a, b) => b.value - a.value);

    const totalSpentThisMonth = currentMonthTransactions
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const totalIncomeThisMonth = currentMonthTransactions
        .filter(t => parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const netSpendingThisMonth = totalSpentThisMonth - totalIncomeThisMonth;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    const firstName = profile?.first_name || 'there';

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Hello, {firstName}</h1>
                <p className="text-slate-500">Here's what's happening with your finances this month.</p>
            </header>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Total Spent"
                    value={`$${totalSpentThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    icon={<DollarSign className="text-rose-600" />}
                    trend="This Month"
                />
                <StatCard
                    title="Total Income"
                    value={`$${totalIncomeThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    icon={<TrendingUp className="text-emerald-600" />}
                    trend="This Month"
                />
                <StatCard
                    title="Net Spending"
                    value={`$${netSpendingThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    icon={<LayoutDashboard className="text-indigo-600" />}
                    trend="This Month"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart Section */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <PieChartIcon size={20} className="text-indigo-600" />
                        Spending by Category
                    </h3>
                    <div className="flex-1 min-h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                    animationBegin={200}
                                    animationDuration={1200}
                                    labelLine={false}
                                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                        return percent > 0.05 ? (
                                            <text
                                                x={x}
                                                y={y}
                                                fill="white"
                                                textAnchor="middle"
                                                dominantBaseline="central"
                                                className="text-[10px] font-bold"
                                            >
                                                {`${(percent * 100).toFixed(0)}%`}
                                            </text>
                                        ) : null;
                                    }}
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value) => `$${value.toFixed(2)}`}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                        {categoryData.slice(0, 5).map((item, idx) => (
                            <div key={item.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    <span className="text-slate-600">{item.name}</span>
                                </div>
                                <span className="font-semibold text-slate-900">${item.value.toFixed(0)}</span>
                            </div>
                        ))}
                        {categoryData.length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">No spending data</p>
                        )}
                    </div>
                </div>

                {/* Transactions Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">Recent Transactions</h3>
                        <button
                            onClick={() => navigate('/dashboard/analysis')}
                            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group"
                        >
                            View All <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                    <TransactionTable
                        transactions={transactions}
                        categories={categories}
                        editingId={editingId}
                        editForm={editForm}
                        onEditStart={handleEditStart}
                        onEditSave={handleEditSave}
                        onEditCancel={handleEditCancel}
                        onEditChange={onEditChange}
                        limit={10}
                    />
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
        </div>
    );
}

function StatCard({ title, value, icon, trend }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-start justify-between mb-2">
                <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shadow-sm">
                    {icon}
                </div>
                <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400">
                    {trend}
                </div>
            </div>
            <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider">{title}</h4>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
        </div>
    );
}
