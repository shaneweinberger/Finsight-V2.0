import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Papa from 'papaparse';
import {
    UploadCloud,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    FileText,
    Plus,
    X,
    Trash2,
} from 'lucide-react';

export default function Processing() {
    // ── Upload state ──────────────────────────────────────────────────────────
    const [pendingFile, setPendingFile] = useState(null);
    const [fileError, setFileError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const fileInputRef = useRef(null);

    // ── Account state ─────────────────────────────────────────────────────────
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');

    // ── Upload history ────────────────────────────────────────────────────────
    const [uploadHistory, setUploadHistory] = useState([]);

    // ── Fetch accounts ────────────────────────────────────────────────────────
    const fetchAccounts = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase
                .from('user_accounts')
                .select('account_name')
                .eq('user_id', user.id)
                .order('account_name');
            if (!error && data) {
                const arr = data.map(d => d.account_name).filter(Boolean);
                setSavedAccounts(arr);
            }
        } catch (err) { console.error('Error fetching accounts:', err); }
    }, []);

    // ── Fetch upload history ──────────────────────────────────────────────────
    const fetchHistory = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            // Fetch one representative row per file for metadata
            const { data, error } = await supabase
                .schema('bronze')
                .from('transactions')
                .select('file_id, file_name, transaction_account, created_at, status, raw_data')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;

            // Group by file_id and compute min/max transaction date from raw_data
            const fileMap = new Map();
            for (const item of data) {
                if (!fileMap.has(item.file_id)) {
                    fileMap.set(item.file_id, { ...item, minDate: null, maxDate: null });
                }
                const rawDate = item.raw_data?.Date;
                if (rawDate) {
                    const d = new Date(rawDate);
                    if (!isNaN(d)) {
                        const entry = fileMap.get(item.file_id);
                        if (!entry.minDate || d < entry.minDate) entry.minDate = d;
                        if (!entry.maxDate || d > entry.maxDate) entry.maxDate = d;
                    }
                }
            }
            setUploadHistory([...fileMap.values()]);
        } catch (err) { console.error('Error fetching upload history:', err); }
    }, []);

    useEffect(() => { fetchAccounts(); fetchHistory(); }, [fetchAccounts, fetchHistory]);

    // ── File selection ────────────────────────────────────────────────────────
    const acceptFile = (file) => {
        if (!file) return;
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            setFileError(`"${file.name}" is not a CSV file. Please upload a .csv file.`);
            setPendingFile(null);
            return;
        }
        setFileError('');
        setStatus({ type: '', message: '' });
        setSelectedAccount('');   // reset so Step 3 stays locked until user picks an account
        setPendingFile(file);
    };

    const handleFileSelect = (e) => acceptFile(e.target.files[0]);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        acceptFile(e.dataTransfer.files[0]);
    };

    const clearFile = (e) => {
        e.stopPropagation();
        setPendingFile(null);
        setFileError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Add account ───────────────────────────────────────────────────────────
    const handleAddAccount = async () => {
        const accName = newAccountName.trim();
        if (!accName) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            const { error } = await supabase.from('user_accounts').insert([{ user_id: user.id, account_name: accName }]);
            if (error && error.code !== '23505') throw error;
            setSavedAccounts(prev => prev.includes(accName) ? prev : [...prev, accName].sort());
            setSelectedAccount(accName);
            setIsAddingNewAccount(false);
            setNewAccountName('');
        } catch (err) {
            setStatus({ type: 'error', message: `Failed to save account: ${err.message}` });
        }
    };

    // ── Run AI processing ─────────────────────────────────────────────────────
    const handleRunAiProcessing = async () => {
        if (!pendingFile || !selectedAccount) return;
        setProcessing(true);
        setStatus({ type: 'info', message: 'Uploading…' });

        Papa.parse(pendingFile, {
            header: false,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error('Not authenticated');

                    const fileId = crypto.randomUUID();
                    const transactions = results.data.map(row => ({
                        user_id: user.id,
                        file_id: fileId,
                        file_name: pendingFile.name,
                        transaction_account: selectedAccount,
                        raw_data: { Date: row[0], Description: row[1], MoneyOut: row[2], MoneyIn: row[3], Balance: row[4] },
                        status: 'pending'
                    }));

                    const { error } = await supabase.schema('bronze').from('transactions').insert(transactions);
                    if (error) throw error;

                    setStatus({ type: 'info', message: 'Uploaded. AI categorizing…' });
                    await processTransactionsInternal();
                } catch (err) {
                    setStatus({ type: 'error', message: `Failed to upload: ${err.message}` });
                    setProcessing(false);
                }
            },
            error: (err) => { setStatus({ type: 'error', message: `CSV error: ${err.message}` }); setProcessing(false); }
        });
    };

    const processTransactionsInternal = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated.');

            let hasMore = true, totalProcessed = 0, loops = 0;
            while (hasMore && loops < 20) {
                const { data, error } = await supabase.functions.invoke('process-transactions', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (error) throw error;
                if (Array.isArray(data)) {
                    const n = data.reduce((a, c) => a + (c.processedCount || 0), 0);
                    totalProcessed += n; hasMore = n > 0;
                } else { hasMore = false; }
                loops++;
            }

            setStatus({ type: 'success', message: `Done! ${totalProcessed} transactions processed.` });
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchHistory();
        } catch (err) {
            let msg = err.message;
            if (err.context?.json) { try { const j = await err.context.json(); if (j?.error) msg = j.error; } catch { } }
            setStatus({ type: 'error', message: `Processing failed: ${msg}` });
        } finally { setProcessing(false); }
    };

    // ── Delete file ───────────────────────────────────────────────────────────
    const handleDeleteFile = async (fileId) => {
        if (!confirm('Delete this upload? All raw records for this file will be removed.')) return;
        try {
            const { error } = await supabase.schema('bronze').from('transactions').delete().eq('file_id', fileId);
            if (error) throw error;
            fetchHistory();
        } catch (err) { console.error('Delete error:', err); }
    };

    const canRun = !!pendingFile && !!selectedAccount && !isAddingNewAccount && !processing;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="w-full pb-16 animate-in fade-in duration-500">

            {/* ── Page Header ──────────────────────────────────────────── */}
            <div className="mb-8">
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Transaction Uploads</h1>
                <p className="text-sm text-slate-400 mt-0.5">Upload CSV files and run AI categorization.</p>
            </div>

            {/* ── Two-column layout ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

                {/* ── LEFT: Upload workflow ─────────────────────────────── */}
                <div className="lg:col-span-5 space-y-8">

                    {/* Status banner */}
                    {status.message && (
                        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${status.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : status.type === 'error'
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            }`}>
                            {status.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                            {status.message}
                            <button onClick={() => setStatus({ type: '', message: '' })} className="ml-auto opacity-60 hover:opacity-100 transition-opacity">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Step 1 — Upload CSV */}
                    <div>
                        <div className="flex items-center gap-2.5 mb-3">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                            <h2 className="text-sm font-bold text-slate-800">Upload CSV</h2>
                        </div>

                        {/* Dropzone */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => !processing && fileInputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all select-none ${isDragging
                                ? 'border-indigo-400 bg-indigo-50'
                                : pendingFile
                                    ? 'border-indigo-200 bg-indigo-50/40'
                                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/60'
                                } ${processing ? 'pointer-events-none opacity-60' : ''}`}
                        >
                            {pendingFile ? (
                                <>
                                    <FileText size={28} className="text-indigo-500 mb-2" />
                                    <span className="text-sm font-semibold text-indigo-700">{pendingFile.name}</span>
                                    <span className="text-xs text-indigo-400 mt-0.5">{(pendingFile.size / 1024).toFixed(1)} KB</span>
                                    <button
                                        onClick={clearFile}
                                        className="absolute top-2.5 right-2.5 p-1 text-slate-300 hover:text-rose-400 transition-colors rounded-lg"
                                    >
                                        <X size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <UploadCloud size={28} className="text-slate-300 mb-2" />
                                    <span className="text-sm text-slate-500">
                                        Drop a CSV here, or <span className="text-indigo-500 font-semibold">browse</span>
                                    </span>
                                    <span className="text-xs text-slate-400 mt-1">.csv files only</span>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleFileSelect}
                                disabled={processing}
                            />
                        </div>

                        {/* Non-CSV error */}
                        {fileError && (
                            <p className="mt-2 text-xs text-rose-500 flex items-center gap-1.5">
                                <AlertCircle size={12} />
                                {fileError}
                            </p>
                        )}
                    </div>

                    {/* Step 2 — Select Account */}
                    <div className={`transition-opacity duration-200 ${!pendingFile ? 'opacity-25 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2.5 mb-3">
                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${pendingFile ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-950'}`}>2</span>
                            <h2 className="text-sm font-bold text-slate-800">Select Account</h2>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            {savedAccounts.map((account, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setSelectedAccount(account); setIsAddingNewAccount(false); setNewAccountName(''); }}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedAccount === account && !isAddingNewAccount
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-100'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        }`}
                                >
                                    {account}
                                </button>
                            ))}

                            {isAddingNewAccount ? (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={newAccountName}
                                        onChange={(e) => setNewAccountName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') { setIsAddingNewAccount(false); setNewAccountName(''); } }}
                                        placeholder="e.g. TD Credit Card"
                                        className="pl-3.5 pr-14 py-1.5 text-xs rounded-full border-2 border-indigo-400 outline-none focus:border-indigo-500"
                                        autoFocus
                                    />
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
                                        <button onClick={handleAddAccount} className="p-1 text-indigo-600 hover:text-indigo-800 transition-colors">
                                            <CheckCircle2 size={13} className="stroke-[2.5]" />
                                        </button>
                                        <button onClick={() => { setIsAddingNewAccount(false); setNewAccountName(''); }} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                                            <X size={13} className="stroke-[2.5]" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setIsAddingNewAccount(true); setSelectedAccount(''); }}
                                    className="w-7 h-7 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-400 flex items-center justify-center transition-all"
                                    title="Add new account"
                                >
                                    <Plus size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Step 3 — Run AI Processing */}
                    <div>
                        <div className={`transition-opacity duration-200 ${!canRun ? 'opacity-25 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-2.5 mb-3">
                                <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${canRun ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-950'}`}>3</span>
                                <h2 className="text-sm font-bold text-slate-800">Run AI Processing</h2>
                            </div>

                            <button
                                onClick={handleRunAiProcessing}
                                disabled={!canRun}
                                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all"
                            >
                                {processing
                                    ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
                                    : <><Sparkles size={16} /> Run AI Processing</>
                                }
                            </button>
                        </div>

                        {!canRun && !processing && (
                            <p className="text-center text-[10px] text-slate-400 mt-2">
                                {!pendingFile && !selectedAccount
                                    ? 'Upload a CSV and select an account to continue.'
                                    : !pendingFile
                                        ? 'Upload a CSV file to continue.'
                                        : 'Select an account to continue.'}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Uploaded files table ───────────────────────── */}
                <div className="lg:col-span-7">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Uploaded Files</p>
                    {uploadHistory.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4">No files uploaded yet.</p>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">File</th>
                                        <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</th>
                                        <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Upload Date</th>
                                        <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Range</th>
                                        <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="px-5 py-2.5 w-10" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {uploadHistory.map((file) => (
                                        <tr key={file.file_id} className="group hover:bg-slate-50/60 transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={13} className="text-slate-300 shrink-0" />
                                                    <span className="text-sm text-slate-700 font-medium">{file.file_name || 'Unnamed'}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{file.transaction_account}</span>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-slate-400 whitespace-nowrap">
                                                {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td className="px-5 py-3 text-sm text-slate-400 whitespace-nowrap">
                                                {file.minDate && file.maxDate ? (
                                                    file.minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ===
                                                        file.maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                        ? file.minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                        : `${file.minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${file.maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${file.status === 'processed' ? 'text-emerald-600' :
                                                    file.status === 'error' ? 'text-rose-500' : 'text-amber-500'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${file.status === 'processed' ? 'bg-emerald-500' :
                                                        file.status === 'error' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse'
                                                        }`} />
                                                    {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <button
                                                    onClick={() => handleDeleteFile(file.file_id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-400 rounded transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
