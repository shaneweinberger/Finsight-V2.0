import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import TransactionTable from './TransactionTable';
import {
    Calendar,
    Filter,
    Loader2,
    Search,
    Download,
    ArrowUpDown,
    Trash2
} from 'lucide-react';

export default function Analysis() {
    const { startDate, setStartDate, endDate, setEndDate } = useOutletContext();
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ description: '', category: '' });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

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
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });

            if (error) throw error;
            setTransactions(data || []);
            // Clear selection on refresh
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

    const onEditChange = (field, value) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
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
        <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Transaction Analysis</h1>
                    <p className="text-slate-500 mt-1">Deep dive into your financial history with advanced filtering.</p>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 px-3">
                        <Calendar size={18} className="text-slate-400" />
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 outline-none"
                        />
                    </div>
                    <div className="text-slate-300">|</div>
                    <div className="flex items-center gap-2 px-3">
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 outline-none"
                        />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-slate-900">Filtered Transactions</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {transactions.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleDeleteSelected}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold transition-all border border-rose-100 shadow-sm animate-in zoom-in-95 duration-200"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                Delete Selected ({selectedIds.size})
                            </button>
                        )}
                        <button className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all shadow-none hover:shadow-sm">
                            <Download size={20} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center p-20">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-indigo-600" size={40} />
                            <p className="text-slate-500 font-medium">Loading transactions...</p>
                        </div>
                    </div>
                ) : transactions.length > 0 ? (
                    <TransactionTable
                        transactions={transactions}
                        categories={categories}
                        editingId={editingId}
                        editForm={editForm}
                        onEditStart={handleEditStart}
                        onEditSave={handleEditSave}
                        onEditCancel={handleEditCancel}
                        onEditChange={onEditChange}
                        selectedIds={selectedIds}
                        onSelectToggle={handleSelectToggle}
                        onSelectAll={handleSelectAll}
                    />
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
        </div>
    );
}
