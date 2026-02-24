
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
    Zap,
    Plus,
    X,
    ArrowRight,
    ChevronDown,
    Trash2,
    AlertCircle,
    Loader2,
    Info,
    Settings2
} from 'lucide-react';

export default function Rules() {
    const [rules, setRules] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState(null);

    // Rule Form State
    const [ruleName, setRuleName] = useState('');
    const [condition, setCondition] = useState({ field: 'description', operator: 'contains', value: '' });
    const [action, setAction] = useState({ category: '', descriptionOverride: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [rulesRes, categoriesRes] = await Promise.all([
                supabase.from('user_rules').select('*').order('priority', { ascending: false }),
                supabase.from('user_categories').select('name').order('name')
            ]);

            if (rulesRes.error) throw rulesRes.error;
            if (categoriesRes.error) throw categoriesRes.error;

            setRules(rulesRes.data || []);
            setCategories(categoriesRes.data || []);
            if (categoriesRes.data?.length > 0) {
                setAction(prev => ({ ...prev, category: categoriesRes.data[0].name }));
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const addRule = async (e) => {
        e.preventDefault();
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const newRule = {
                user_id: user.id,
                name: ruleName,
                conditions: condition,
                actions: action,
                is_active: true,
                priority: rules.length
            };

            const { data, error } = await supabase
                .from('user_rules')
                .insert([newRule])
                .select();

            if (error) throw error;

            setRules(prev => [data[0], ...prev]);
            setShowForm(false);
            resetForm();
        } catch (err) {
            console.error('Error adding rule:', err);
            setError(err.message);
        }
    };

    const deleteRule = async (id) => {
        try {
            const { error } = await supabase.from('user_rules').delete().eq('id', id);
            if (error) throw error;
            setRules(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error('Error deleting rule:', err);
            setError(err.message);
        }
    };

    const resetForm = () => {
        setRuleName('');
        setCondition({ field: 'description', operator: 'contains', value: '' });
        setAction({ category: categories[0]?.name || '', descriptionOverride: '' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <Zap className="text-amber-500 fill-amber-500" size={32} />
                        Automation Rules
                    </h1>
                    <p className="text-slate-500 mt-1">Teach AI how to handle specific merchants and categories.</p>
                </div>

                <button
                    onClick={() => setShowForm(!showForm)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg ${showForm ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
                        }`}
                >
                    {showForm ? <X size={20} /> : <Plus size={20} />}
                    {showForm ? 'Cancel' : 'Create New Rule'}
                </button>
            </header>

            {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
                        <X size={16} />
                    </button>
                </div>
            )}

            {showForm && (
                <div className="bg-white p-8 rounded-2xl border-2 border-indigo-500 shadow-xl animate-in slide-in-from-top-4 duration-300">
                    <form onSubmit={addRule} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Rule Name</label>
                                <input
                                    required
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-100"
                                    placeholder="e.g. Lunch at Office, Uber Rides"
                                    value={ruleName}
                                    onChange={(e) => setRuleName(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                            <div className="flex items-center gap-3 text-slate-900 font-bold mb-2">
                                <Settings2 size={18} className="text-indigo-600" />
                                If transaction satisfies:
                            </div>
                            <div className="grid md:grid-cols-3 gap-4">
                                <select
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                                    value={condition.field}
                                    onChange={(e) => setCondition(prev => ({ ...prev, field: e.target.value }))}
                                >
                                    <option value="description">Description</option>
                                    <option value="amount">Amount</option>
                                    <option value="transaction_type">Type</option>
                                </select>
                                <select
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                                    value={condition.operator}
                                    onChange={(e) => setCondition(prev => ({ ...prev, operator: e.target.value }))}
                                >
                                    <option value="contains">Contains</option>
                                    <option value="equals">Equals</option>
                                    <option value="greater_than">Greater than</option>
                                    <option value="less_than">Less than</option>
                                </select>
                                <input
                                    required
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                                    placeholder="Value..."
                                    value={condition.value}
                                    onChange={(e) => setCondition(prev => ({ ...prev, value: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex justify-center px-4">
                            <div className="bg-indigo-600 h-10 w-1 flex items-center justify-center relative">
                                <ArrowRight className="absolute text-indigo-600 bg-white rounded-full p-1 border-2 border-indigo-600" size={32} />
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 space-y-4">
                            <div className="flex items-center gap-3 text-indigo-900 font-bold mb-2">
                                <Zap size={18} className="text-amber-500 fill-amber-500" />
                                Then perform actions:
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-indigo-700">Assign Category</label>
                                    <select
                                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                                        value={action.category}
                                        onChange={(e) => setAction(prev => ({ ...prev, category: e.target.value }))}
                                    >
                                        <option value="">Select Category...</option>
                                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-indigo-700">Override Description (Optional)</label>
                                    <input
                                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                                        placeholder="New description..."
                                        value={action.descriptionOverride}
                                        onChange={(e) => setAction(prev => ({ ...prev, descriptionOverride: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all text-lg"
                        >
                            Save Rule
                        </button>
                    </form>
                </div>
            )}

            <div className="grid gap-4">
                {rules.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                        <Zap size={48} className="mx-auto text-slate-200 mb-4" />
                        <h3 className="text-xl font-bold text-slate-800">No rules configured</h3>
                        <p className="text-slate-500 mt-2">Rules help Gemini process recurring transactions automatically.</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-6 text-indigo-600 font-bold hover:underline"
                        >
                            Get started by creating your first rule
                        </button>
                    </div>
                ) : (
                    rules.map((rule) => (
                        <div key={rule.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                            <div className="flex items-start justify-between">
                                <div className="space-y-4 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                            <Zap size={18} fill="currentColor" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900">{rule.name}</h3>
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                                            Priority {rule.priority}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                            <span className="text-slate-400 font-medium">If</span>
                                            <span className="font-bold text-slate-700 capitalize">{rule.conditions.field}</span>
                                            <span className="text-indigo-500 italic">{rule.conditions.operator.replace('_', ' ')}</span>
                                            <span className="font-bold text-slate-700">"{rule.conditions.value}"</span>
                                        </div>
                                        <ArrowRight size={16} className="text-slate-300" />
                                        <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                            <span className="text-emerald-500 font-medium">Then</span>
                                            <span className="font-bold text-emerald-700">{rule.actions.category}</span>
                                            {rule.actions.descriptionOverride && (
                                                <>
                                                    <span className="text-emerald-300">|</span>
                                                    <span className="text-emerald-700 italic">"{rule.actions.descriptionOverride}"</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => deleteRule(rule.id)}
                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="flex items-start gap-4 p-6 bg-amber-50 border border-amber-100 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <Info size={20} className="text-amber-600" />
                </div>
                <div>
                    <h4 className="font-bold text-amber-900 mb-1">How rules affect processing</h4>
                    <p className="text-amber-800/80 text-sm leading-relaxed">
                        Rules are sent to Gemini along with your custom categories. The AI uses these rules as strict instructions to ensure
                        consistent categorization and description cleanup. High-priority rules are evaluated first.
                    </p>
                </div>
            </div>
        </div>
    );
}
