import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
    Tags,
    Zap,
    Plus,
    X,
    Pencil,
    Trash2,
    AlertCircle,
    Loader2,
    CheckCircle2,
    FileText,
    Info,
    RefreshCw,
    HelpCircle
} from 'lucide-react';

// ─── Default color palette for new categories ────────────────────────────────
const DEFAULT_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#3b82f6',
    '#84cc16', '#d946ef', '#f43f5e', '#0ea5e9', '#eab308'
];

// ─── Confirmation Modal ──────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger = false }) {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">{message}</p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm ${danger
                            ? 'bg-rose-500 hover:bg-rose-600'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Toast Notification ──────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3500);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed bottom-6 right-6 z-[10001] flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-lg border animate-in slide-in-from-bottom-4 duration-300 ${type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
            {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span className="text-sm font-semibold">{message}</span>
            <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
                <X size={14} />
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AIProcessing() {
    // ── Categories state ─────────────────────────────────────────────────────
    const [categories, setCategories] = useState([]);
    const [showCatForm, setShowCatForm] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState(DEFAULT_COLORS[0]);
    const [editingCat, setEditingCat] = useState(null); // { id, name, color }
    const [editCatName, setEditCatName] = useState('');
    const [editCatColor, setEditCatColor] = useState('');

    // ── Rules state ──────────────────────────────────────────────────────────
    const [rules, setRules] = useState([]);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [showRulesHelp, setShowRulesHelp] = useState(false);
    const [newRuleName, setNewRuleName] = useState('');
    const [newRuleText, setNewRuleText] = useState('');
    const [editingRule, setEditingRule] = useState(null); // { id, name, rule_text }
    const [editRuleName, setEditRuleName] = useState('');
    const [editRuleText, setEditRuleText] = useState('');

    // ── Shared state ─────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Baseline snapshots for dirty-state comparison ─────────────────────────
    // Stores the DB state at last load/reprocess so we can compute isDirty
    const baselineCats = useRef([]);
    const baselineRules = useRef([]);

    // ── Computed dirty state ─────────────────────────────────────────────────
    const snapshotCats = (arr) => arr.map(c => ({ id: c.id, name: c.name, color: c.color || '' }));
    const snapshotRules = (arr) => arr.map(r => ({ id: r.id, name: r.name, rule_text: r.rule_text || '' }));
    // ── Computed change summary ─────────────────────────────────────────────
    const changeSummary = (() => {
        const curCats = snapshotCats(categories);
        const curRules = snapshotRules(rules);

        const newCats = curCats.filter(c => !baselineCats.current.some(bc => bc.id === c.id)).length;
        const updatedCats = curCats.filter(c => {
            const bc = baselineCats.current.find(b => b.id === c.id);
            return bc && (bc.name !== c.name || bc.color !== c.color);
        }).length;
        const deletedCats = baselineCats.current.filter(bc => !curCats.some(c => c.id === bc.id)).length;

        const newRules = curRules.filter(r => !baselineRules.current.some(br => br.id === r.id)).length;
        const updatedRules = curRules.filter(r => {
            const br = baselineRules.current.find(b => b.id === r.id);
            return br && (br.name !== r.name || br.rule_text !== r.rule_text);
        }).length;
        const deletedRules = baselineRules.current.filter(br => !curRules.some(r => r.id === br.id)).length;

        const hasChanges = newCats > 0 || updatedCats > 0 || deletedCats > 0 || newRules > 0 || updatedRules > 0 || deletedRules > 0;

        // Build a friendly description
        const parts = [];
        const catChanges = [];
        if (newCats > 0) catChanges.push('new');
        if (updatedCats > 0) catChanges.push('updated');
        if (deletedCats > 0) catChanges.push('removed');

        if (catChanges.length > 0) {
            parts.push(`${catChanges.join('/')} categor${newCats + updatedCats + deletedCats === 1 ? 'y' : 'ies'}`);
        }

        const ruleChanges = [];
        if (newRules > 0) ruleChanges.push('new');
        if (updatedRules > 0) ruleChanges.push('updated');
        if (deletedRules > 0) ruleChanges.push('removed');

        if (ruleChanges.length > 0) {
            parts.push(`${ruleChanges.join('/')} rule${newRules + updatedRules + deletedRules === 1 ? '' : 's'}`);
        }

        let description = "Select files to reprocess";
        if (parts.length > 0) {
            description = `Select files to reprocess with your ${parts.join(' and ')}.`;
        }

        return { hasChanges, description };
    })();

    const isDirty = changeSummary.hasChanges;

    // ── Confirmation modal state ─────────────────────────────────────────────
    const [confirmModal, setConfirmModal] = useState(null);

    // ── Reprocess modal state ────────────────────────────────────────────────
    const [showReprocessModal, setShowReprocessModal] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [selectedFileIds, setSelectedFileIds] = useState(new Set());
    const [isReprocessing, setIsReprocessing] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(false);

    // ── Fetch data on mount ──────────────────────────────────────────────────
    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [catRes, ruleRes] = await Promise.all([
                supabase.from('user_categories').select('*').order('name'),
                supabase.from('user_rules').select('*').order('created_at', { ascending: false })
            ]);
            if (catRes.error) throw catRes.error;
            if (ruleRes.error) throw ruleRes.error;
            const cats = catRes.data || [];
            const rls = ruleRes.data || [];
            setCategories(cats);
            setRules(rls);
            // Freeze baseline so isDirty computes against initial DB state
            baselineCats.current = snapshotCats(cats);
            baselineRules.current = snapshotRules(rls);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORIES CRUD
    // ═══════════════════════════════════════════════════════════════════════════

    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCatName.trim()) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase
                .from('user_categories')
                .insert([{ name: newCatName.trim(), color: newCatColor, user_id: user.id }])
                .select();
            if (error) throw error;
            setCategories(prev => [...prev, ...data].sort((a, b) => a.name.localeCompare(b.name)));
            setNewCatName('');
            setNewCatColor(DEFAULT_COLORS[(categories.length + 1) % DEFAULT_COLORS.length]);
            setShowCatForm(false);

        } catch (err) {
            if (err.code === '23505' || err.message?.includes('unique constraint')) {
                setError(`A category named "${newCatName.trim()}" already exists.`);
            } else {
                setError(err.message);
            }
        }
    };

    const startEditCategory = (cat) => {
        setEditingCat(cat);
        setEditCatName(cat.name);
        setEditCatColor(cat.color || DEFAULT_COLORS[0]);
    };

    const cancelEditCategory = () => {
        setEditingCat(null);
        setEditCatName('');
        setEditCatColor('');
    };

    const saveEditCategory = () => {
        // Diff detection: if nothing changed, just close
        const nameChanged = editCatName.trim() !== editingCat.name;
        const colorChanged = editCatColor !== (editingCat.color || DEFAULT_COLORS[0]);

        if (!nameChanged && !colorChanged) {
            cancelEditCategory();
            return;
        }

        setConfirmModal({
            title: 'Save changes to category?',
            message: `Update "${editingCat.name}" with your changes.`,
            confirmLabel: 'Save Changes',
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    const { data, error } = await supabase
                        .from('user_categories')
                        .update({ name: editCatName.trim(), color: editCatColor })
                        .eq('id', editingCat.id)
                        .select();
                    if (error) throw error;
                    setCategories(prev => prev.map(c => c.id === editingCat.id ? data[0] : c).sort((a, b) => a.name.localeCompare(b.name)));

                    cancelEditCategory();
                } catch (err) {
                    setError(err.message);
                }
            },
            onCancel: () => setConfirmModal(null)
        });
    };

    const handleDeleteCategory = (cat) => {
        setConfirmModal({
            title: 'Delete category?',
            message: `Are you sure you want to delete "${cat.name}"? This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    const { error } = await supabase.from('user_categories').delete().eq('id', cat.id);
                    if (error) throw error;
                    setCategories(prev => prev.filter(c => c.id !== cat.id));

                    if (editingCat?.id === cat.id) cancelEditCategory();
                } catch (err) {
                    setError(err.message);
                }
            },
            onCancel: () => setConfirmModal(null)
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RULES CRUD
    // ═══════════════════════════════════════════════════════════════════════════

    const handleAddRule = async (e) => {
        e.preventDefault();
        if (!newRuleText.trim()) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase
                .from('user_rules')
                .insert([{
                    user_id: user.id,
                    name: newRuleName.trim() || `Rule #${rules.length + 1}`,
                    rule_text: newRuleText.trim(),
                    is_active: true,
                    priority: rules.length,
                    conditions: null,
                    actions: null
                }])
                .select();
            if (error) throw error;
            setRules(prev => [data[0], ...prev]);
            setNewRuleName('');
            setNewRuleText('');
            setShowRuleForm(false);

        } catch (err) {
            setError(err.message);
        }
    };

    const startEditRule = (rule) => {
        setEditingRule(rule);
        setEditRuleName(rule.name);
        setEditRuleText(rule.rule_text || '');
    };

    const cancelEditRule = () => {
        setEditingRule(null);
        setEditRuleName('');
        setEditRuleText('');
    };

    const saveEditRule = () => {
        const nameChanged = editRuleName.trim() !== editingRule.name;
        const textChanged = editRuleText.trim() !== (editingRule.rule_text || '');

        if (!nameChanged && !textChanged) {
            cancelEditRule();
            return;
        }

        setConfirmModal({
            title: 'Save changes to rule?',
            message: `Update "${editingRule.name}" with your changes.`,
            confirmLabel: 'Save Changes',
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    const { data, error } = await supabase
                        .from('user_rules')
                        .update({ name: editRuleName.trim(), rule_text: editRuleText.trim() })
                        .eq('id', editingRule.id)
                        .select();
                    if (error) throw error;
                    setRules(prev => prev.map(r => r.id === editingRule.id ? data[0] : r));

                    cancelEditRule();
                } catch (err) {
                    setError(err.message);
                }
            },
            onCancel: () => setConfirmModal(null)
        });
    };

    const handleDeleteRule = (rule) => {
        setConfirmModal({
            title: 'Delete rule?',
            message: `Are you sure you want to delete "${rule.name}"? This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    const { error } = await supabase.from('user_rules').delete().eq('id', rule.id);
                    if (error) throw error;
                    setRules(prev => prev.filter(r => r.id !== rule.id));

                    if (editingRule?.id === rule.id) cancelEditRule();
                } catch (err) {
                    setError(err.message);
                }
            },
            onCancel: () => setConfirmModal(null)
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // REPROCESS LOGIC
    // ═══════════════════════════════════════════════════════════════════════════

    const openReprocessModal = async () => {
        setShowReprocessModal(true);
        setLoadingFiles(true);
        setSelectedFileIds(new Set());
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase
                .schema('bronze')
                .from('transactions')
                .select('file_id, file_name, transaction_account, created_at, status')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;

            const uniqueFiles = [];
            const seen = new Set();
            for (const item of data) {
                if (!seen.has(item.file_id)) { seen.add(item.file_id); uniqueFiles.push(item); }
            }
            setUploadedFiles(uniqueFiles);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingFiles(false);
        }
    };

    const toggleFileSelection = (fileId) => {
        setSelectedFileIds(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedFileIds.size === uploadedFiles.length) {
            setSelectedFileIds(new Set());
        } else {
            setSelectedFileIds(new Set(uploadedFiles.map(f => f.file_id)));
        }
    };

    const handleReprocessSelected = async () => {
        if (selectedFileIds.size === 0) return;
        setIsReprocessing(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user.id;
            const fileIds = Array.from(selectedFileIds);

            // 1. Delete silver transactions for selected files
            for (const fileId of fileIds) {
                const { error: silverError } = await supabase
                    .from('silver_transactions')
                    .delete()
                    .eq('user_id', userId)
                    .eq('file_id', fileId);
                if (silverError) throw new Error(`Failed to clear silver for file ${fileId}: ${silverError.message}`);
            }

            // 2. Reset bronze status to 'pending' for selected files
            for (const fileId of fileIds) {
                const { error: bronzeError } = await supabase
                    .schema('bronze')
                    .from('transactions')
                    .update({ status: 'pending' })
                    .eq('user_id', userId)
                    .eq('file_id', fileId);
                if (bronzeError) throw new Error(`Failed to reset bronze for file ${fileId}: ${bronzeError.message}`);
            }

            // 3. Invoke edge function in a loop until all processed
            let hasMore = true;
            let totalProcessed = 0;
            let loops = 0;
            const MAX_LOOPS = 20;

            while (hasMore && loops < MAX_LOOPS) {
                const { data: funcData, error: funcError } = await supabase.functions.invoke('process-transactions');
                if (funcError) throw new Error(`Edge function failed: ${funcError.message}`);

                if (funcData && Array.isArray(funcData)) {
                    const n = funcData.reduce((acc, curr) => acc + (curr.processedCount || 0), 0);
                    totalProcessed += n;
                    hasMore = n > 0;
                } else if (funcData && funcData.message === "No pending transactions found.") {
                    hasMore = false;
                } else {
                    hasMore = false;
                }
                loops++;
            }

            // Reset the baseline to the current live data so isDirty becomes false
            baselineCats.current = snapshotCats(categories);
            baselineRules.current = snapshotRules(rules);
            setShowReprocessModal(false);
            setToast({ message: `Successfully reprocessed ${totalProcessed} transactions from ${fileIds.length} file(s).`, type: 'success' });
        } catch (err) {
            console.error('Reprocess error:', err);
            setToast({ message: `Reprocessing failed: ${err.message}`, type: 'error' });
        } finally {
            setIsReprocessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    return (
        <div className="w-full pb-16 animate-in fade-in duration-500">

            {/* ── Page Header ──────────────────────────────────────────── */}
            <div className="mb-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="max-w-xl">
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Configure AI Processing</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Manage the categories and AI rules used to process your transactions into clean financial data.</p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                        onClick={openReprocessModal}
                        disabled={!isDirty}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-all shadow-sm ${isDirty
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 cursor-pointer'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                    >
                        <RefreshCw size={16} className={isDirty ? '' : 'opacity-40'} />
                        Reprocess Transactions
                    </button>
                    {!isDirty && (
                        <p className="text-[10px] text-slate-400 font-medium">Update categories or rules to reprocess data</p>
                    )}
                </div>
            </div>

            {/* ── Error Banner ─────────────────────────────────────────── */}
            {error && (
                <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
                    <AlertCircle size={16} />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
                </div>
            )}

            {/* ── Two-Column Layout ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* ─── LEFT: Categories ────────────────────────────────── */}
                <div className="lg:col-span-5">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                            <Tags size={16} className="text-indigo-500" />
                            <h2 className="text-sm font-bold text-slate-800">Categories</h2>
                            <span className="text-xs text-slate-400 font-medium">{categories.length}</span>
                            <button
                                onClick={() => { setShowCatForm(!showCatForm); setEditingCat(null); }}
                                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${showCatForm
                                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                    }`}
                            >
                                {showCatForm ? <X size={12} /> : <Plus size={12} />}
                                {showCatForm ? 'Cancel' : 'New Category'}
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Hideable add category form */}
                            {showCatForm && (
                                <form onSubmit={handleAddCategory} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex gap-2">
                                        <div
                                            className="relative shrink-0 w-9 h-9 rounded-lg border border-slate-200 overflow-hidden cursor-pointer bg-white hover:border-indigo-300 transition-colors"
                                            style={{ backgroundColor: newCatColor }}
                                        >
                                            <input
                                                type="color"
                                                value={newCatColor}
                                                onChange={(e) => setNewCatColor(e.target.value)}
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                title="Pick a color"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Category name…"
                                            value={newCatName}
                                            onChange={(e) => setNewCatName(e.target.value)}
                                            className="flex-1 text-sm px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-200 placeholder:text-slate-400"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={!newCatName.trim()}
                                            className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all"
                                        >
                                            Save Category
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Category list */}
                            {categories.length === 0 ? (
                                <p className="text-xs text-slate-400 py-4 text-center">No categories yet.</p>
                            ) : (
                                <div className="space-y-0.5 max-h-[440px] overflow-y-auto pr-1">
                                    {categories.map((cat) => (
                                        <div key={cat.id}>
                                            {editingCat?.id === cat.id ? (
                                                /* Edit inline */
                                                <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                                                    <div
                                                        className="relative shrink-0 w-7 h-7 rounded-md border border-indigo-200 overflow-hidden cursor-pointer"
                                                        style={{ backgroundColor: editCatColor }}
                                                    >
                                                        <input
                                                            type="color"
                                                            value={editCatColor}
                                                            onChange={(e) => setEditCatColor(e.target.value)}
                                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                        />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={editCatName}
                                                        onChange={(e) => setEditCatName(e.target.value)}
                                                        className="flex-1 text-sm px-2 py-1 bg-white border border-indigo-200 rounded-md outline-none focus:ring-1 focus:ring-indigo-200"
                                                        autoFocus
                                                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory(); }}
                                                    />
                                                    <button onClick={saveEditCategory} className="p-1 text-indigo-600 hover:text-indigo-800 transition-colors">
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                    <button onClick={cancelEditCategory} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                /* Display row */
                                                <div className="group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                    <div
                                                        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/5"
                                                        style={{ backgroundColor: cat.color || DEFAULT_COLORS[categories.indexOf(cat) % DEFAULT_COLORS.length] }}
                                                    />
                                                    <span className="text-sm text-slate-700 flex-1">{cat.name}</span>
                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button
                                                            onClick={() => startEditCategory(cat)}
                                                            className="p-1 text-slate-300 hover:text-indigo-500 rounded transition-colors"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteCategory(cat)}
                                                            className="p-1 text-slate-300 hover:text-rose-400 rounded transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── RIGHT: Rules ────────────────────────────────────── */}
                <div className="lg:col-span-7">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                            <Zap size={16} className="text-amber-500" />
                            <h2 className="text-sm font-bold text-slate-800">AI Rules</h2>
                            <span className="text-xs text-slate-400 font-medium">{rules.length}</span>
                            <button
                                onClick={() => setShowRulesHelp(true)}
                                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
                                title="How do rules work?"
                            >
                                <span className="text-[11px] font-bold">How do rules work?</span>
                                <HelpCircle size={14} />
                            </button>
                            <button
                                onClick={() => { setShowRuleForm(!showRuleForm); cancelEditRule(); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showRuleForm
                                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                            >
                                {showRuleForm ? <X size={13} /> : <Plus size={13} />}
                                {showRuleForm ? 'Cancel' : 'New Rule'}
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            {/* New rule form */}
                            {showRuleForm && (
                                <form onSubmit={handleAddRule} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                    <input
                                        type="text"
                                        placeholder="Rule name (optional)"
                                        value={newRuleName}
                                        onChange={(e) => setNewRuleName(e.target.value)}
                                        className="w-full text-sm px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-200 placeholder:text-slate-400"
                                    />
                                    <textarea
                                        required
                                        rows={3}
                                        placeholder='e.g. "All transactions labeled TD Visa payment should be deleted"'
                                        value={newRuleText}
                                        onChange={(e) => setNewRuleText(e.target.value)}
                                        className="w-full text-sm px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-200 resize-none placeholder:text-slate-400"
                                    />
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-indigo-500/70">
                                            <Info size={12} />
                                            <span>Sent to Gemini as a strict processing instruction.</span>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!newRuleText.trim()}
                                            className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all"
                                        >
                                            Save Rule
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Rules list */}
                            {rules.length === 0 && !showRuleForm ? (
                                <div className="text-center py-10">
                                    <Zap size={36} className="mx-auto text-slate-200 mb-3" />
                                    <p className="text-sm text-slate-500 font-medium">No rules configured yet.</p>
                                    <button onClick={() => setShowRuleForm(true)} className="mt-3 text-sm text-indigo-600 font-semibold hover:underline">
                                        Create your first rule
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                                    {rules.map((rule) => (
                                        <div key={rule.id}>
                                            {editingRule?.id === rule.id ? (
                                                /* Edit inline */
                                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                                                    <input
                                                        type="text"
                                                        value={editRuleName}
                                                        onChange={(e) => setEditRuleName(e.target.value)}
                                                        className="w-full text-sm px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-200 font-medium"
                                                        autoFocus
                                                    />
                                                    <textarea
                                                        rows={3}
                                                        value={editRuleText}
                                                        onChange={(e) => setEditRuleText(e.target.value)}
                                                        className="w-full text-sm px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-200 resize-none"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={cancelEditRule} className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                                                            Cancel
                                                        </button>
                                                        <button onClick={saveEditRule} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-all">
                                                            Save
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Display card */
                                                <div className="group bg-white border border-slate-100 rounded-xl p-4 hover:shadow-sm hover:border-slate-200 transition-all">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                                                    <Zap size={13} fill="currentColor" />
                                                                </div>
                                                                <h4 className="text-sm font-bold text-slate-800 truncate">{rule.name}</h4>
                                                                <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider shrink-0">
                                                                    AI
                                                                </span>
                                                            </div>
                                                            {rule.rule_text && (
                                                                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 pl-8">
                                                                    "{rule.rule_text}"
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                                            <button
                                                                onClick={() => startEditRule(rule)}
                                                                className="p-1.5 text-slate-300 hover:text-indigo-500 rounded-lg transition-colors"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteRule(rule)}
                                                                className="p-1.5 text-slate-300 hover:text-rose-400 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>



            {/* ═══ Reprocess Modal ═══════════════════════════════════════ */}
            {showReprocessModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-100">
                            <h3 className="text-lg font-bold text-slate-900">Reprocess Raw Files</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                {changeSummary.description}
                            </p>
                        </div>

                        {/* File List */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            {loadingFiles ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="animate-spin text-indigo-500" size={24} />
                                </div>
                            ) : uploadedFiles.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-12">No uploaded files found.</p>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="py-2.5 pr-3 w-10">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    checked={selectedFileIds.size === uploadedFiles.length && uploadedFiles.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th className="py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">File</th>
                                            <th className="py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</th>
                                            <th className="py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                            <th className="py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {uploadedFiles.map((file) => (
                                            <tr
                                                key={file.file_id}
                                                className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${selectedFileIds.has(file.file_id) ? 'bg-indigo-50/30' : ''}`}
                                                onClick={() => toggleFileSelection(file.file_id)}
                                            >
                                                <td className="py-3 pr-3">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        checked={selectedFileIds.has(file.file_id)}
                                                        onChange={() => toggleFileSelection(file.file_id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="py-3">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={13} className="text-slate-300 shrink-0" />
                                                        <span className="text-sm text-slate-700 font-medium">{file.file_name || 'Unnamed'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3">
                                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{file.transaction_account}</span>
                                                </td>
                                                <td className="py-3 text-sm text-slate-400">
                                                    {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </td>
                                                <td className="py-3">
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${file.status === 'processed' ? 'text-emerald-600' : file.status === 'error' ? 'text-rose-500' : 'text-amber-500'}`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${file.status === 'processed' ? 'bg-emerald-500' : file.status === 'error' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                                                        {file.status?.charAt(0).toUpperCase() + file.status?.slice(1)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">
                                {selectedFileIds.size} of {uploadedFiles.length} selected
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowReprocessModal(false)}
                                    disabled={isReprocessing}
                                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReprocessSelected}
                                    disabled={selectedFileIds.size === 0 || isReprocessing}
                                    className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-indigo-200"
                                >
                                    {isReprocessing ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Reprocessing…
                                        </>
                                    ) : (
                                        'Reprocess Selected'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Rules Help Modal ════════════════════════════════════ */}
            {showRulesHelp && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setShowRulesHelp(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                    <Zap size={16} fill="currentColor" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">How AI Rules Work</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Write rules in plain English — Gemini will follow them strictly.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowRulesHelp(false)} className="p-1 text-slate-300 hover:text-slate-500 transition-colors rounded-lg">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-5 space-y-6">

                            {/* What rules can do */}
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">What rules can do</p>
                                <div className="space-y-2.5">
                                    {[
                                        {
                                            label: 'Delete transactions',
                                            color: 'bg-rose-50 text-rose-600',
                                            example: '"Delete any transaction where the description contains TD Visa Payment"',
                                        },
                                        {
                                            label: 'Change category',
                                            color: 'bg-indigo-50 text-indigo-600',
                                            example: '"Categorize all Uber and Lyft transactions as Transportation"',
                                        },
                                        {
                                            label: 'Rename description',
                                            color: 'bg-emerald-50 text-emerald-700',
                                            example: '"Rename any description starting with AMZN MKTP to Amazon"',
                                        },
                                        {
                                            label: 'Combine rules',
                                            color: 'bg-amber-50 text-amber-700',
                                            example: '"If the amount is under $5 and the merchant is a coffee shop, categorize as Dining"',
                                        },
                                    ].map(({ label, color, example }) => (
                                        <div key={label} className="flex gap-3 items-start">
                                            <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                                            <p className="text-xs text-slate-500 italic leading-relaxed">{example}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* What you can match on */}
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Factors you can match on</p>
                                <div className="flex flex-wrap gap-2">
                                    {['Merchant / payee name', 'Transaction description', 'Amount', 'Account', 'Date or month', 'Category (already assigned)'].map(f => (
                                        <span key={f} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg">{f}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Tips */}
                            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4">
                                <div className="flex items-center gap-1.5 text-indigo-600 mb-2">
                                    <Info size={13} />
                                    <span className="text-xs font-bold">Tips</span>
                                </div>
                                <ul className="text-xs text-slate-500 space-y-1.5 list-disc list-inside leading-relaxed">
                                    <li>Be specific: the more context you give, the more accurate the result.</li>
                                    <li>After saving a new rule, use <strong>Reprocess Transactions</strong> to apply it to existing data.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-5">
                            <button
                                onClick={() => setShowRulesHelp(false)}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Confirmation Modal ═══════════════════════════════════ */}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmLabel={confirmModal.confirmLabel}
                    danger={confirmModal.danger}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={confirmModal.onCancel}
                />
            )}

            {/* ═══ Toast ═══════════════════════════════════════════════ */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}
