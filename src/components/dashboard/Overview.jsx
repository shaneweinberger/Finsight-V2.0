
import React, { useState, useEffect } from 'react';
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
    ArrowRight
} from 'lucide-react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

import TransactionTable from './TransactionTable';

export default function Overview() {
    // ... items stay same ...
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ description: '', category: '' });

    const onEditChange = (field, value) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    // ... fetchData, fetchTransactions, fetchCategories stay same ...

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchCategories()]);
        setLoading(false);
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

    const categoryData = transactions.reduce((acc, tx) => {
        const found = acc.find(item => item.name === tx.category);
        const amount = Math.abs(parseFloat(tx.amount));
        if (found) {
            found.value += amount;
        } else {
            acc.push({ name: tx.category || 'Uncategorized', value: amount });
        }
        return acc;
    }, []).sort((a, b) => b.value - a.value);

    // Filter logic updated: Spending = Negative, Income = Positive
    const totalSpent = transactions
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const avgTransaction = transactions.length > 0 ? totalSpent / transactions.length : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <header>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial Overview</h1>
                <p className="text-slate-500 mt-1">Real-time insights from your processed Silver data.</p>
            </header>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Total Spent"
                    value={`$${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    icon={<DollarSign className="text-rose-600" />}
                    trend="+4.3%"
                    positive={false}
                />
                <StatCard
                    title="Avg. Transaction"
                    value={`$${avgTransaction.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    icon={<TrendingUp className="text-indigo-600" />}
                    trend="-2.1%"
                    positive={true}
                />
                <StatCard
                    title="Active Categories"
                    value={categoryData.length}
                    icon={<Tag className="text-emerald-600" />}
                    trend="Stable"
                    positive={true}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart Section */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <PieChartIcon size={20} className="text-indigo-600" />
                        Spending by Category
                    </h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
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
                        {categoryData.slice(0, 4).map((item, idx) => (
                            <div key={item.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    <span className="text-slate-600">{item.name}</span>
                                </div>
                                <span className="font-semibold text-slate-900">${item.value.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Transactions Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">Recent Transactions</h3>
                        <button className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group">
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
        </div>
    );
}

function StatCard({ title, value, icon, trend, positive }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                    {icon}
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'Stable' ? 'text-slate-400' :
                    positive ? 'text-emerald-500' : 'text-rose-500'
                    }`}>
                    {trend === 'Stable' ? '' : positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {trend}
                </div>
            </div>
            <h4 className="text-slate-500 text-sm font-medium">{title}</h4>
            <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
        </div>
    );
}
