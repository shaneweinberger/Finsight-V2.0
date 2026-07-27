import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { parseBankCSV } from '../../utils/csvParser';
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
    Lock,
    AlertTriangle,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    ChevronLeft,
    ChevronRight,
    Filter
} from 'lucide-react';
import { useProcessing } from '../../lib/ProcessingContext';

export default function Processing() {
    // ── Upload state ──────────────────────────────────────────────────────────
    const [pendingFile, setPendingFile] = useState(null);
    const [fileError, setFileError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [parseErrorModal, setParseErrorModal] = useState({ open: false, message: '' });
    const fileInputRef = useRef(null);
    const { startProcessing, stopProcessing, getAbortSignal } = useProcessing();

    // ── Token limit blocked state ─────────────────────────────────────────────
    // Set when the Edge Function returns TOKEN_LIMIT_EXCEEDED (HTTP 429).
    // Shape: { period: 'monthly'|'weekly'|'daily', resetAt: ISO string } | null
    const [tokenLimitInfo, setTokenLimitInfo] = useState(null);

    // ── Account state ─────────────────────────────────────────────────────────
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');

    // ── Upload history ────────────────────────────────────────────────────────
    const [uploadHistory, setUploadHistory] = useState([]);

    // ── Table Filters, Sorting & Pagination ──────────────────────────────────
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    const [filterAccount, setFilterAccount] = useState('all');
    const [filterDate, setFilterDate] = useState('all');
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const uniqueAccounts = React.useMemo(() => {
        return [...new Set(uploadHistory.map(h => h.transaction_account))].filter(Boolean).sort();
    }, [uploadHistory]);

    const uniqueDates = React.useMemo(() => {
        const dates = uploadHistory.map(h => new Date(h.created_at).toLocaleDateString('en-US'));
        return [...new Set(dates)].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [uploadHistory]);

    const processedHistory = React.useMemo(() => {
        let filtered = uploadHistory.filter(item => {
            if (filterAccount !== 'all' && item.transaction_account !== filterAccount) return false;
            if (filterDate !== 'all') {
                const itemDate = new Date(item.created_at).toLocaleDateString('en-US');
                if (itemDate !== filterDate) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (sortConfig.key === 'created_at') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            } else if (sortConfig.key === 'transaction_account') {
                aVal = (aVal || '').toLowerCase();
                bVal = (bVal || '').toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [uploadHistory, filterAccount, filterDate, sortConfig]);

    const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(processedHistory.length / itemsPerPage);
    const displayHistory = React.useMemo(() => {
        if (itemsPerPage === 'all') return processedHistory;
        const start = (currentPage - 1) * itemsPerPage;
        return processedHistory.slice(start, start + itemsPerPage);
    }, [processedHistory, currentPage, itemsPerPage]);

    // Reset to page 1 if filters/itemsPerPage change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterAccount, filterDate, itemsPerPage, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIndicator = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ChevronsUpDown size={14} className="opacity-30" />;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-accent" /> : <ChevronDown size={14} className="text-accent" />;
    };

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

    // ── Delete account ────────────────────────────────────────────────────────
    const handleDeleteAccount = async (accountName) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Check if any bronze transactions reference this account
            const { data: existing, error: checkError } = await supabase
                .schema('bronze')
                .from('transactions')
                .select('id')
                .eq('user_id', user.id)
                .eq('transaction_account', accountName)
                .limit(1);
            if (checkError) throw checkError;

            if (existing && existing.length > 0) {
                setStatus({ type: 'error', message: `Cannot delete "${accountName}" — it has processed files associated with it.` });
                return;
            }

            const { error } = await supabase
                .from('user_accounts')
                .delete()
                .eq('user_id', user.id)
                .eq('account_name', accountName);
            if (error) throw error;

            setSavedAccounts(prev => prev.filter(a => a !== accountName));
            if (selectedAccount === accountName) setSelectedAccount('');
        } catch (err) {
            console.error('Error deleting account:', err);
            setStatus({ type: 'error', message: `Failed to delete account: ${err.message}` });
        }
    };

    // ── Run AI processing ─────────────────────────────────────────────────────
    const handleRunAiProcessing = async () => {
        if (!pendingFile || !selectedAccount) return;
        setProcessing(true);
        setStatus({ type: 'info', message: 'Parsing CSV…' });
        startProcessing('Uploading and categorizing your transactions with AI…');

        try {
            // Smart-parse the CSV: auto-detects headers vs. headerless formats.
            // `skippedCount` covers rows the parser rejected as unusable —
            // spreadsheet padding, footer totals, undated rows.
            const { transactions: parsed, error: parseError, skippedCount = 0 } = await parseBankCSV(pendingFile);

            if (parseError) {
                setParseErrorModal({ open: true, message: parseError });
                setProcessing(false);
                stopProcessing();
                return;
            }

            if (parsed.length === 0) {
                setStatus({
                    type: 'error',
                    message: skippedCount > 0
                        ? `No usable transactions found — all ${skippedCount} row${skippedCount === 1 ? '' : 's'} were blank or missing a date/amount.`
                        : 'No transactions found in the CSV file.'
                });
                setProcessing(false);
                stopProcessing();
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const fileId = crypto.randomUUID();
            const transactions = parsed.map(row => ({
                user_id: user.id,
                file_id: fileId,
                file_name: pendingFile.name,
                transaction_account: selectedAccount,
                raw_data: row, // Already standardized: { Date, Description, Amount }
                status: 'pending'
            }));

            const skipNote = skippedCount > 0
                ? ` (skipped ${skippedCount} blank row${skippedCount === 1 ? '' : 's'})`
                : '';

            setStatus({ type: 'info', message: `Uploading ${parsed.length} transactions${skipNote}…` });
            const { error } = await supabase.schema('bronze').from('transactions').insert(transactions);
            if (error) throw error;

            setStatus({ type: 'info', message: 'Uploaded. AI categorizing…' });
            await processTransactionsInternal();
        } catch (err) {
            setStatus({ type: 'error', message: `Failed to upload: ${err.message}` });
            setProcessing(false);
            stopProcessing();
        }
    };

    const processTransactionsInternal = async () => {
        const abortSignal = getAbortSignal();
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated.');

            let hasMore = true, totalProcessed = 0, loops = 0;
            while (hasMore && loops < 20) {
                if (abortSignal.cancelled) {
                    setStatus({ type: 'error', message: 'Processing cancelled.' });
                    return;
                }
                const { data, error } = await supabase.functions.invoke('process-transactions', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                // ── Token limit check ────────────────────────────────────────
                // The Edge Function returns a structured TOKEN_LIMIT_EXCEEDED payload
                // (HTTP 429) when the user has consumed their configured token allowance
                // for the current period. We surface this as a dedicated blocked state
                // rather than a generic error, so the user gets a clear explanation.
                if (error) {
                    // Parse the response body ONCE (it can only be read once from the stream)
                    let parsedBody = null;
                    try {
                        if (error.context?.json) {
                            parsedBody = await error.context.json();
                        }
                    } catch { /* ignore parse failures */ }

                    if (parsedBody?.error === 'TOKEN_LIMIT_EXCEEDED') {
                        setTokenLimitInfo({
                            period: parsedBody.period,
                            resetAt: parsedBody.resetAt,
                            tokensUsed: parsedBody.tokensUsed,
                            tokenLimit: parsedBody.tokenLimit,
                        });
                        setStatus({ type: '', message: '' });
                        return;
                    }

                    // Attach the parsed body so the catch block can read the real error
                    // (the Response stream is already consumed, so we can't read it again)
                    const enhancedError = new Error(
                        parsedBody?.error || parsedBody?.details || error.message || 'Edge Function returned a non-2xx status code'
                    );
                    throw enhancedError;
                }
            //...continued
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
            setStatus({ type: 'error', message: `Processing failed: ${err.message}` });
        } finally {
            setProcessing(false);
            stopProcessing();
        }
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

    // Block processing if the user has hit their token limit for the current period
    const isTokenLimitBlocked = tokenLimitInfo != null;
    const canRun = !!pendingFile && !!selectedAccount && !isAddingNewAccount && !processing && !isTokenLimitBlocked;

    // ── Parse Error Modal ─────────────────────────────────────────────────────
    const ParseErrorModal = () => {
        if (!parseErrorModal.open) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
                    <div className="flex items-center gap-3 text-amber-600">
                        <AlertTriangle size={24} />
                        <h3 className="text-lg font-bold text-slate-900">Unrecognized CSV Format</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{parseErrorModal.message}</p>
                    <div className="flex justify-end">
                        <button
                            onClick={() => setParseErrorModal({ open: false, message: '' })}
                            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-all"
                        >Got it</button>
                    </div>
                </div>
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
        <ParseErrorModal />
        <div className="w-full pb-16 animate-in fade-in duration-500">

            {/* ── Page Header ──────────────────────────────────────────── */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Transaction Uploads</h1>
                <p className="text-slate-500 mt-1">Upload CSV files and run AI categorization.</p>
            </div>

            {/* ── Token Limit Blocked Banner ────────────────────────────── */}
            {isTokenLimitBlocked && (() => {
                const periodLabel = tokenLimitInfo.period
                    ? tokenLimitInfo.period.charAt(0).toUpperCase() + tokenLimitInfo.period.slice(1)
                    : 'Usage';
                const resetDate = tokenLimitInfo.resetAt
                    ? new Date(tokenLimitInfo.resetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : null;
                return (
                    <div className="mb-6 flex items-start gap-3.5 px-5 py-4 rounded-xl border border-amber-200 bg-amber-50">
                        <div className="mt-0.5 w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                            <Lock size={15} className="text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-amber-800">
                                {periodLabel} processing limit reached
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                                Your account has reached its {tokenLimitInfo.period} AI processing limit
                                {tokenLimitInfo.tokensUsed != null && tokenLimitInfo.tokenLimit != null
                                    ? ` (${tokenLimitInfo.tokensUsed.toLocaleString()} / ${tokenLimitInfo.tokenLimit.toLocaleString()} tokens used)`
                                    : ''}
                                . Processing is paused{resetDate ? ` until ${resetDate}` : ''}.
                            </p>
                        </div>
                        <button
                            onClick={() => setTokenLimitInfo(null)}
                            className="shrink-0 p-1 text-amber-400 hover:text-amber-600 transition-colors rounded"
                            title="Dismiss"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })()}

            {/* ── Status banner ────────────────────────────────────────── */}
            {status.message && (
                <div className={`mb-6 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${status.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : status.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-accent-light border-accent-ring text-accent-light-text'
                    }`}>
                    {status.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    {status.message}
                    <button onClick={() => setStatus({ type: '', message: '' })} className="ml-auto opacity-60 hover:opacity-100 transition-opacity">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── Three-step row ─────────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row items-start gap-6">

                {/* Step 1 — Upload CSV */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-3">
                        <span className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                        <h2 className="text-sm font-bold text-slate-800">Upload CSV</h2>
                    </div>

                    {/* Dropzone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !processing && fileInputRef.current?.click()}
                        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all select-none ${isDragging
                            ? 'border-accent-border bg-accent-light'
                            : pendingFile
                                ? 'border-accent-ring bg-accent-light/40'
                                : 'border-slate-200 hover:border-accent-border hover:bg-slate-50/60'
                            } ${processing ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        {pendingFile ? (
                            <>
                                <FileText size={28} className="text-accent mb-2" />
                                <span className="text-sm font-semibold text-accent-light-text">{pendingFile.name}</span>
                                <span className="text-xs text-accent mt-0.5">{(pendingFile.size / 1024).toFixed(1)} KB</span>
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
                                    Drop a CSV here, or <span className="text-accent font-semibold">browse</span>
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
                <div className={`flex-1 min-w-0 transition-opacity duration-200 ${!pendingFile ? 'opacity-25 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-2.5 mb-3">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${pendingFile ? 'bg-accent text-white' : 'bg-slate-200 text-slate-950'}`}>2</span>
                        <h2 className="text-sm font-bold text-slate-800">Select Account</h2>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                        {savedAccounts.map((account, i) => (
                            <div
                                key={i}
                                className={`group/pill relative flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${selectedAccount === account && !isAddingNewAccount
                                    ? 'bg-accent text-white border-accent shadow-sm shadow-accent-shadow'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-accent-border'
                                    }`}
                                onClick={() => { setSelectedAccount(account); setIsAddingNewAccount(false); setNewAccountName(''); }}
                            >
                                {account}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account); }}
                                    className={`ml-0.5 opacity-0 group-hover/pill:opacity-100 transition-opacity rounded-full p-0.5 ${selectedAccount === account && !isAddingNewAccount
                                        ? 'hover:bg-white/20 text-white/70 hover:text-white'
                                        : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'
                                        }`}
                                    title={`Delete ${account}`}
                                >
                                    <X size={11} className="stroke-[3]" />
                                </button>
                            </div>
                        ))}

                        {isAddingNewAccount ? (
                            <div className="relative">
                                <input
                                    type="text"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') { setIsAddingNewAccount(false); setNewAccountName(''); } }}
                                    placeholder="e.g. TD Credit Card"
                                    className="pl-3.5 pr-14 py-1.5 text-xs rounded-full border-2 border-accent-border outline-none focus:border-accent"
                                    autoFocus
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
                                    <button onClick={handleAddAccount} className="p-1 text-accent hover:text-accent-light-text transition-colors">
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
                                className="w-7 h-7 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-accent-border hover:text-accent flex items-center justify-center transition-all"
                                title="Add new account"
                            >
                                <Plus size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Step 3 — Run AI Processing */}
                <div className="flex-1 min-w-0">
                    <div className={`transition-opacity duration-200 ${!canRun ? 'opacity-25 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2.5 mb-3">
                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${canRun ? 'bg-accent text-white' : 'bg-slate-200 text-slate-950'}`}>3</span>
                            <h2 className="text-sm font-bold text-slate-800">Run AI Processing</h2>
                        </div>

                        <button
                            onClick={handleRunAiProcessing}
                            disabled={!canRun}
                            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover shadow-sm shadow-accent-shadow transition-all"
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

            {/* ── Uploaded Files table (full-width below) ────────────── */}
            <div className="mt-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">Uploaded Files</p>
                    
                    {/* Controls Row */}
                    {uploadHistory.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">Show:</span>
                            <select
                                className="text-xs bg-white border border-slate-200 outline-none focus:ring-1 focus:ring-accent-ring rounded-lg px-2 py-1.5 cursor-pointer font-medium text-slate-700 shadow-sm"
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    )}
                </div>

                {uploadHistory.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4">No files uploaded yet.</p>
                ) : (
                    <div className="bg-surface-card rounded-xl border border-divider shadow-sm overflow-hidden flex flex-col">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">
                                            File
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none group">
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors"
                                                    onClick={() => requestSort('transaction_account')}
                                                >
                                                    Account
                                                    <div className={`transition-opacity ${sortConfig.key === 'transaction_account' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        <SortIndicator columnKey="transaction_account" />
                                                    </div>
                                                </div>
                                                <div className="relative flex items-center justify-center w-5 h-5 rounded hover:bg-slate-200/60 transition-colors" title="Filter by Account">
                                                    <Filter size={12} className={`absolute pointer-events-none ${filterAccount !== 'all' ? 'text-accent' : 'text-slate-400'}`} />
                                                    {filterAccount !== 'all' && (
                                                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-accent rounded-full border border-white" />
                                                    )}
                                                    <select
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        value={filterAccount}
                                                        onChange={(e) => setFilterAccount(e.target.value)}
                                                    >
                                                        <option value="all">All Accounts</option>
                                                        {uniqueAccounts.map(acc => (
                                                            <option key={acc} value={acc}>{acc}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none group">
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors"
                                                    onClick={() => requestSort('created_at')}
                                                >
                                                    Upload Date
                                                    <div className={`transition-opacity ${sortConfig.key === 'created_at' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        <SortIndicator columnKey="created_at" />
                                                    </div>
                                                </div>
                                                <div className="relative flex items-center justify-center w-5 h-5 rounded hover:bg-slate-200/60 transition-colors" title="Filter by Upload Date">
                                                    <Filter size={12} className={`absolute pointer-events-none ${filterDate !== 'all' ? 'text-accent' : 'text-slate-400'}`} />
                                                    {filterDate !== 'all' && (
                                                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-accent rounded-full border border-white" />
                                                    )}
                                                    <select
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        value={filterDate}
                                                        onChange={(e) => setFilterDate(e.target.value)}
                                                    >
                                                        <option value="all">All Dates</option>
                                                        {uniqueDates.map(date => (
                                                            <option key={date} value={date}>{date}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">
                                            Date Range
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">
                                            Status
                                        </th>
                                        <th className="px-5 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 bg-white">
                                    {displayHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                                                No files match your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        displayHistory.map((file) => (
                                            <tr key={file.file_id} className="group hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} className="text-slate-300 shrink-0" />
                                                        <span className="text-sm text-slate-700 font-medium">{file.file_name || 'Unnamed'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">{file.transaction_account}</span>
                                                </td>
                                                <td className="px-5 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">
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
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${file.status === 'processed' ? 'text-emerald-600' :
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
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                                        title="Delete file"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {itemsPerPage !== 'all' && totalPages > 1 && (
                            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-xs text-slate-500 font-medium">
                                    Showing <span className="font-bold text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, processedHistory.length)}</span> of <span className="font-bold text-slate-700">{processedHistory.length}</span> results
                                </p>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <div className="flex items-center gap-1 px-2">
                                        {Array.from({ length: totalPages }).map((_, i) => {
                                            const page = i + 1;
                                            // Show limited pages if too many
                                            if (totalPages > 5) {
                                                if (page !== 1 && page !== totalPages && Math.abs(page - currentPage) > 1) {
                                                    if (page === 2 || page === totalPages - 1) return <span key={page} className="text-slate-400 text-xs px-1">...</span>;
                                                    return null;
                                                }
                                            }
                                            return (
                                                <button
                                                    key={page}
                                                    onClick={() => setCurrentPage(page)}
                                                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors ${
                                                        currentPage === page 
                                                            ? 'bg-accent text-white' 
                                                            : 'text-slate-600 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
        </>
    );
}
