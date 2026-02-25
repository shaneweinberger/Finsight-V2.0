import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, Sparkles, FileText, History, Trash2, Plus, X } from 'lucide-react';

export default function TransactionUploads() {
    const [pendingFile, setPendingFile] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [uploadHistory, setUploadHistory] = useState([]);

    // Account Selection State
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');

    const fileInputRef = useRef(null);

    const fetchHistory = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Group by file_id to get the list of unique uploads
            // We use a group by approach here manually as Supabase doesn't easily support DISTINCT ON in JS filters
            const { data, error } = await supabase
                .schema('bronze')
                .from('transactions')
                .select('file_id, file_name, transaction_account, created_at, status')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Local de-duplication by file_id
            const uniqueFiles = [];
            const seen = new Set();
            for (const item of data) {
                if (!seen.has(item.file_id)) {
                    seen.add(item.file_id);
                    uniqueFiles.push(item);
                }
            }

            setUploadHistory(uniqueFiles);

            // Fetch unique transaction accounts from user_accounts
            const { data: accountsData, error: accountsError } = await supabase
                .from('user_accounts')
                .select('account_name')
                .eq('user_id', user.id)
                .order('account_name');

            if (!accountsError && accountsData) {
                const accountArray = accountsData.map(d => d.account_name).filter(Boolean);
                setSavedAccounts(accountArray);

                // Set default selected account if available
                if (accountArray.length > 0) {
                    if (!selectedAccount) setSelectedAccount(accountArray[0]);
                }
            }

        } catch (err) {
            console.error('Error fetching data:', err);
        }
    }, [selectedAccount]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleDeleteFile = async (fileId) => {
        if (!confirm('Are you sure you want to delete this upload? All raw records for this file will be removed.')) return;

        try {
            setStatus({ type: 'info', message: 'Deleting file records...' });

            const { error } = await supabase
                .schema('bronze')
                .from('transactions')
                .delete()
                .eq('file_id', fileId);

            if (error) throw error;

            setStatus({ type: 'success', message: 'File records deleted successfully.' });
            fetchHistory();
        } catch (err) {
            console.error('Delete error:', err);
            setStatus({ type: 'error', message: `Failed to delete: ${err.message}` });
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setPendingFile(file);
            setStatus({ type: '', message: '' });
        }
    };

    const handleAddAccount = async () => {
        const accName = newAccountName.trim();
        if (!accName) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            setStatus({ type: 'info', message: 'Saving new account...' });

            const { error } = await supabase
                .from('user_accounts')
                .insert([{ user_id: user.id, account_name: accName }]);

            if (error && error.code !== '23505') { // ignore duplicate key error just in case
                throw error;
            }

            setStatus({ type: 'success', message: `Account "${accName}" saved.` });

            setSavedAccounts(prev => {
                const newArr = prev.includes(accName) ? prev : [...prev, accName].sort();
                return newArr;
            });
            setSelectedAccount(accName);
            setIsAddingNewAccount(false);
            setNewAccountName('');
        } catch (err) {
            console.error('Error adding account:', err);
            setStatus({ type: 'error', message: `Failed to save account: ${err.message}` });
        }
    };

    const handleRunAiProcessing = async () => {
        if (!pendingFile) {
            setStatus({ type: 'error', message: 'Please select a CSV file first.' });
            return;
        }

        const finalAccountName = selectedAccount;
        if (!finalAccountName) {
            setStatus({ type: 'error', message: 'Please select a transaction account first.' });
            return;
        }

        setProcessing(true);
        setStatus({ type: 'info', message: 'Reading and uploading your file...' });

        Papa.parse(pendingFile, {
            header: false,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error('User not authenticated');

                    const fileId = crypto.randomUUID();
                    const fileName = pendingFile.name;

                    // Manually map array rows to objects based on user-provided schema
                    const transactions = results.data.map(row => {
                        return {
                            user_id: user.id,
                            file_id: fileId,
                            file_name: fileName,
                            transaction_account: finalAccountName,
                            raw_data: {
                                Date: row[0],
                                Description: row[1],
                                MoneyOut: row[2],
                                MoneyIn: row[3],
                                Balance: row[4]
                            },
                            status: 'pending'
                        };
                    });

                    setStatus({ type: 'info', message: 'Uploading to Bronze layer...' });

                    const { error } = await supabase
                        .schema('bronze')
                        .from('transactions')
                        .insert(transactions);

                    if (error) throw error;

                    setStatus({ type: 'info', message: 'Uploaded successfully. AI is now categorizing...' });
                    await processTransactionsInternal(finalAccountName);

                } catch (err) {
                    console.error('Upload error:', err);
                    setStatus({
                        type: 'error',
                        message: `Failed to upload: ${err.message}`
                    });
                    setProcessing(false);
                }
            },
            error: (err) => {
                setStatus({ type: 'error', message: `CSV Parsing error: ${err.message}` });
                setProcessing(false);
            }
        });
    };

    const processTransactionsInternal = async (usedAccountName) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated. Please sign in again.');
            }

            let hasMore = true;
            let totalProcessed = 0;
            let loopCount = 0;
            const MAX_LOOPS = 20;

            while (hasMore && loopCount < MAX_LOOPS) {
                console.log(`[Uploads] Processing loop ${loopCount + 1}...`);
                const { data: funcData, error: functionError } = await supabase.functions.invoke('process-transactions', {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`
                    }
                });

                if (functionError) throw functionError;

                if (funcData && Array.isArray(funcData)) {
                    const processedThisTime = funcData.reduce((acc, curr) => acc + (curr.processedCount || 0), 0);
                    totalProcessed += processedThisTime;
                    console.log(`[Uploads] Processed ${processedThisTime} in this loop. Total: ${totalProcessed}`);
                    hasMore = processedThisTime > 0;
                } else if (funcData && funcData.message === "No pending transactions found.") {
                    hasMore = false;
                } else {
                    hasMore = false;
                }

                loopCount++;
            }

            setStatus({
                type: 'success',
                message: `AI processing complete! ${totalProcessed} transactions moved to the Silver table.`
            });

            // Cleanup inputs
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';

            if (isAddingNewAccount && usedAccountName) {
                setSavedAccounts(prev => Array.from(new Set([...prev, usedAccountName])));
                setSelectedAccount(usedAccountName);
                setIsAddingNewAccount(false);
                setNewAccountName('');
            }

            fetchHistory(); // Refresh statuses in history
        } catch (err) {
            console.error('Processing error:', err);
            let errorMessage = err.message;
            if (err.context && typeof err.context.json === 'function') {
                try {
                    const errorContext = await err.context.json();
                    if (errorContext && errorContext.error) errorMessage = errorContext.error;
                } catch {
                    // Ignore JSON parse errors for the error context
                }
            }
            setStatus({
                type: 'error',
                message: `Processing failed: ${errorMessage}`
            });
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <UploadCloud className="text-indigo-600" size={32} />
                        Transaction Ingestion
                    </h1>
                    <p className="text-slate-500 mt-1">Upload your raw CSV data to the Bronze layer for AI processing.</p>
                </div>
            </div>

            {status.message && (
                <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    status.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                        'bg-indigo-50 border-indigo-200 text-indigo-800'
                    }`}>
                    {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <p className="font-medium">{status.message}</p>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 mb-8 max-w-2xl mx-auto space-y-8">

                {/* Step 1: Upload CSV */}
                <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-sm">1</span>
                        Upload CSV File
                    </h3>
                    <label className="block w-full cursor-pointer group">
                        <div className={`
                            flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-all
                            ${pendingFile ? 'bg-indigo-50/50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-400 hover:bg-white'}
                        `}>
                            {pendingFile ? (
                                <>
                                    <FileText size={40} className="text-indigo-500 mb-3" />
                                    <span className="text-sm font-semibold text-indigo-700">{pendingFile.name}</span>
                                    <span className="text-xs text-indigo-400 mt-1">{(pendingFile.size / 1024).toFixed(1)} KB</span>
                                </>
                            ) : (
                                <>
                                    <UploadCloud size={40} className="text-slate-400 mb-3 group-hover:text-indigo-500 transition-colors" />
                                    <span className="text-sm font-semibold text-slate-700">Click to select or drag & drop</span>
                                    <span className="text-xs text-slate-400 mt-1">Accepts standard CSV statements</span>
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
                    </label>
                </div>

                {/* Step 2: Select Account */}
                <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-sm">2</span>
                        Select Account
                    </h3>

                    <div className="flex flex-wrap items-center gap-3">
                        {savedAccounts.map((account, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    setSelectedAccount(account);
                                    setIsAddingNewAccount(false);
                                    setNewAccountName('');
                                }}
                                className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all border ${selectedAccount === account && !isAddingNewAccount
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                                    : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                                    }`}
                            >
                                {account}
                            </button>
                        ))}

                        {isAddingNewAccount ? (
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAddAccount();
                                    }}
                                    placeholder="e.g. TD Credit Card"
                                    className="w-full pl-4 pr-20 py-2.5 rounded-full font-medium text-sm border-2 border-indigo-500 outline-none shadow-sm shadow-indigo-100"
                                    autoFocus
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button
                                        onClick={handleAddAccount}
                                        className="p-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-full transition-colors"
                                        title="Save account"
                                    >
                                        <CheckCircle2 size={14} className="stroke-[3]" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsAddingNewAccount(false);
                                            setNewAccountName('');
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                        title="Cancel"
                                    >
                                        <X size={14} className="stroke-[3]" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    setIsAddingNewAccount(true);
                                    setSelectedAccount('');
                                }}
                                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 border-dashed transition-all ${savedAccounts.length === 0 ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-slate-50'}`}
                                title="Add brand new account"
                            >
                                <Plus size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Step 3: Run AI Processing */}
                <div className="pt-6 border-t border-slate-100">
                    <button
                        onClick={handleRunAiProcessing}
                        disabled={!pendingFile || !selectedAccount || isAddingNewAccount || processing}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {processing ? (
                            <Loader2 size={24} className="animate-spin" />
                        ) : (
                            <Sparkles size={24} className="group-hover:animate-pulse" />
                        )}
                        {processing ? 'Uploading & Processing...' : 'Run AI Processing'}
                    </button>
                </div>
            </div>

            {/* Upload History */}
            {uploadHistory.length > 0 && (
                <div className="mt-12">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <History size={20} className="text-indigo-500" />
                        Recently Uploaded Files
                    </h3>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">File Name</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Upload Date</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {uploadHistory.map((file) => (
                                    <tr key={file.file_id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-slate-400" />
                                                <span className="font-medium text-slate-900">{file.file_name || 'Unnamed File'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700`}>
                                                {file.transaction_account}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {new Date(file.created_at).toLocaleDateString()} {new Date(file.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded ${file.status === 'processed' ? 'text-emerald-600 bg-emerald-50' :
                                                file.status === 'error' ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${file.status === 'processed' ? 'bg-emerald-500' :
                                                    file.status === 'error' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                                                    }`} />
                                                {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleDeleteFile(file.file_id)}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="Delete upload"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
