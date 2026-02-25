import React, { useState, useMemo } from 'react';
import { Edit2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export default function TransactionTable({
    transactions,
    categories,
    editingId,
    editForm,
    onEditStart,
    onEditSave,
    onEditCancel,
    onEditChange,
    selectedIds = new Set(),
    onSelectToggle,
    onSelectAll,
    limit
}) {
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    const sortedTransactions = useMemo(() => {
        let sortableItems = [...transactions];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle special cases
                if (sortConfig.key === 'amount') {
                    aValue = parseFloat(aValue);
                    bValue = parseFloat(bValue);
                } else if (sortConfig.key === 'date') {
                    aValue = new Date(aValue).getTime();
                    bValue = new Date(bValue).getTime();
                } else {
                    // Strings (description, type, category)
                    aValue = (aValue || '').toString().toLowerCase();
                    bValue = (bValue || '').toString().toLowerCase();
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [transactions, sortConfig]);

    const displayTransactions = limit ? sortedTransactions.slice(0, limit) : sortedTransactions;

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIndicator = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ChevronsUpDown size={14} className="opacity-30" />;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-indigo-600" /> : <ChevronDown size={14} className="text-indigo-600" />;
    };

    const isAllSelected = displayTransactions.length > 0 && displayTransactions.every(tx => selectedIds.has(tx.id));
    const isSomeSelected = displayTransactions.some(tx => selectedIds.has(tx.id)) && !isAllSelected;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider select-none">
                        <th className="px-6 py-4 w-10">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                    checked={isAllSelected}
                                    ref={el => el && (el.indeterminate = isSomeSelected)}
                                    onChange={() => onSelectAll(displayTransactions.map(tx => tx.id))}
                                />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-colors"
                            onClick={() => requestSort('date')}
                        >
                            <div className="flex items-center gap-1">
                                Date <SortIndicator columnKey="date" />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-colors"
                            onClick={() => requestSort('description')}
                        >
                            <div className="flex items-center gap-1">
                                Description <SortIndicator columnKey="description" />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-colors"
                            onClick={() => requestSort('transaction_method')}
                        >
                            <div className="flex items-center gap-1">
                                Type <SortIndicator columnKey="transaction_method" />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-colors"
                            onClick={() => requestSort('category')}
                        >
                            <div className="flex items-center gap-1">
                                Category <SortIndicator columnKey="category" />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100/50 transition-colors"
                            onClick={() => requestSort('amount')}
                        >
                            <div className="flex items-center justify-end gap-1">
                                Amount <SortIndicator columnKey="amount" />
                            </div>
                        </th>
                        <th className="px-6 py-4"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {displayTransactions.map((tx) => (
                        <tr
                            key={tx.id}
                            className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.has(tx.id) ? 'bg-indigo-50/30' : ''}`}
                        >
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                        checked={selectedIds.has(tx.id)}
                                        onChange={() => onSelectToggle(tx.id)}
                                    />
                                </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                                {new Date(tx.date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                            </td>
                            <td className="px-6 py-4">
                                {editingId === tx.id ? (
                                    <input
                                        className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-100 outline-none"
                                        value={editForm.description}
                                        onChange={(e) => onEditChange('description', e.target.value)}
                                    />
                                ) : (
                                    <span className="text-sm font-medium text-slate-900 truncate block max-w-[200px]">
                                        {tx.description}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${tx.transaction_method === 'credit' ? 'bg-indigo-50 text-indigo-700' :
                                    tx.transaction_method === 'debit' ? 'bg-amber-50 text-amber-700' :
                                        'bg-slate-50 text-slate-700'
                                    }`}>
                                    {tx.transaction_method ? tx.transaction_method.toUpperCase() : tx.transaction_type}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {editingId === tx.id ? (
                                    <select
                                        className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                        value={editForm.category}
                                        onChange={(e) => onEditChange('category', e.target.value)}
                                    >
                                        <option value="">Uncategorized</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                        {tx.category || 'Uncategorized'}
                                    </span>
                                )}
                            </td>
                            <td className={`px-6 py-4 text-sm font-bold text-right ${parseFloat(tx.amount) > 0 ? 'text-emerald-600' : 'text-slate-900'
                                }`}>
                                {parseFloat(tx.amount) > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right">
                                {editingId === tx.id ? (
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => onEditSave(tx.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                            <Check size={16} />
                                        </button>
                                        <button onClick={onEditCancel} className="p-1 text-rose-600 hover:bg-rose-50 rounded">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onEditStart(tx)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
