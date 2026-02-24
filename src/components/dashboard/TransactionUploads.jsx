
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Papa from 'papaparse';
import { UploadCloud, CreditCard, Wallet, CheckCircle2, AlertCircle, Loader2, Sparkles, FileText, History, Trash2 } from 'lucide-react';

export default function TransactionUploads() {
    const [uploading, setUploading] = useState(null); // 'credit' or 'debit'
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [uploadHistory, setUploadHistory] = useState([]);

    const fetchHistory = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Group by file_id to get the list of unique uploads
            // We use a group by approach here manually as Supabase doesn't easily support DISTINCT ON in JS filters
            const { data, error } = await supabase
                .schema('bronze')
                .from('transactions')
                .select('file_id, file_name, transaction_type, created_at, status')
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
        } catch (err) {
            console.error('Error fetching history:', err);
        }
    }, []);

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

    const handleFileUpload = async (event, type) => {
        const file = event.target.files[0];
        if (!file) return;

        setUploading(type);
        setStatus({ type: '', message: '' });

        Papa.parse(file, {
            header: false, // TD CSVs have no headers
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error('User not authenticated');

                    const fileId = crypto.randomUUID();
                    const fileName = file.name;

                    // Manually map array rows to objects based on user-provided schema
                    // Schema: Date | Description | Money Out | Money In | Balance
                    const transactions = results.data.map(row => {
                        // row is an array like ["01/01/2024", "UBER", "15.00", "", "100.00"]
                        const rawObject = {
                            Date: row[0],
                            Description: row[1],
                            MoneyOut: row[2],
                            MoneyIn: row[3],
                            Balance: row[4]
                        };

                        return {
                            user_id: user.id,
                            file_id: fileId,
                            file_name: fileName,
                            transaction_type: type,
                            raw_data: rawObject,
                            status: 'pending'
                        };
                    });

                    const { error } = await supabase
                        .schema('bronze')
                        .from('transactions')
                        .insert(transactions);

                    if (error) throw error;

                    setStatus({
                        type: 'success',
                        message: `Successfully uploaded ${transactions.length} ${type} transactions!`
                    });

                    fetchHistory(); // Refresh history
                } catch (err) {
                    console.error('Upload error:', err);
                    setStatus({
                        type: 'error',
                        message: `Failed to upload: ${err.message}`
                    });
                } finally {
                    setUploading(null);
                    event.target.value = ''; // Reset input
                }
            },
            error: (err) => {
                setStatus({ type: 'error', message: `CSV Parsing error: ${err.message}` });
                setUploading(null);
            }
        });
    };

    const processTransactions = async () => {
        setProcessing(true);
        setStatus({ type: 'info', message: 'AI is processing your transactions...' });

        try {
            const { data, error } = await supabase.functions.invoke('process-transactions');

            if (error) throw error;

            setStatus({
                type: 'success',
                message: 'AI processing complete! Your Silver table has been updated.'
            });

            fetchHistory(); // Refresh statuses in history
        } catch (err) {
            console.error('Processing error:', err);

            let errorMessage = err.message;

            // Handle Supabase FunctionsHttpError to get the actual response body
            if (err.context && typeof err.context.json === 'function') {
                try {
                    const errorContext = await err.context.json();
                    if (errorContext && errorContext.error) {
                        errorMessage = errorContext.error;
                    }
                } catch (jsonErr) {
                    console.error('Failed to parse error context:', jsonErr);
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

                <button
                    onClick={processTransactions}
                    disabled={processing}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    {processing ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : (
                        <Sparkles size={20} className="group-hover:animate-pulse" />
                    )}
                    {processing ? 'Processing...' : 'Run AI Categorization'}
                </button>
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

            <div className="grid md:grid-cols-2 gap-8">
                {/* Credit Card Upload */}
                <UploadCard
                    title="Credit Transactions"
                    description="Upload your credit card statements (CSV format)"
                    icon={<CreditCard size={28} className="text-indigo-600" />}
                    type="credit"
                    loading={uploading === 'credit'}
                    onUpload={(e) => handleFileUpload(e, 'credit')}
                />

                {/* Debit Card Upload */}
                <UploadCard
                    title="Debit Transactions"
                    description="Upload your debit/savings statements (CSV format)"
                    icon={<Wallet size={28} className="text-emerald-600" />}
                    type="debit"
                    loading={uploading === 'debit'}
                    onUpload={(e) => handleFileUpload(e, 'debit')}
                />
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
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
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
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${file.transaction_type === 'credit' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {file.transaction_type}
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

            <div className="mt-12 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <Sparkles size={20} className="text-amber-500" />
                    How the Pipeline Works
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                    <StepCard
                        number="1"
                        title="Bronze Layer"
                        desc="Your raw CSV data is normalized and stored securely in the bronze schema."
                    />
                    <StepCard
                        number="2"
                        title="AI Processing"
                        desc="Gemini analyzes descriptions, applies your custom rules, and assigns categories."
                    />
                    <StepCard
                        number="3"
                        title="Silver Layer"
                        desc="Cleaned, categorized records are moved to the Silver table as your source of truth."
                    />
                </div>
            </div>
        </div>
    );
}

function UploadCard({ title, description, icon, type, loading, onUpload }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="p-6">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">{title}</h2>
                <p className="text-slate-500 text-sm mb-6">{description}</p>

                <label className="block w-full cursor-pointer">
                    <div className={`
                        flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-all
                        ${loading ? 'bg-slate-50 border-slate-300' : 'bg-slate-50/50 border-slate-200 hover:border-indigo-400 hover:bg-white'}
                    `}>
                        {loading ? (
                            <Loader2 size={32} className="animate-spin text-slate-400" />
                        ) : (
                            <>
                                <UploadCloud size={32} className="text-slate-400 mb-2" />
                                <span className="text-sm font-semibold text-slate-700">Click to upload or drag & drop</span>
                                <span className="text-xs text-slate-400 mt-1">Accepts CSV only</span>
                            </>
                        )}
                        <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={onUpload}
                            disabled={loading}
                        />
                    </div>
                </label>
            </div>
        </div>
    );
}

function StepCard({ number, title, desc }) {
    return (
        <div className="relative pl-10">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold text-indigo-600 shadow-sm">
                {number}
            </div>
            <h4 className="font-bold text-slate-900 mb-1">{title}</h4>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
        </div>
    );
}
