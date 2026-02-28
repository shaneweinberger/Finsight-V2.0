import React, { useState, useMemo, useEffect } from 'react';
import { Edit2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown, Calendar } from 'lucide-react';

export default function TransactionTable({
    transactions,
    categories,
    isEditingMode,
    editDrafts = {},
    onDraftChange,
    selectedIds = new Set(),
    onSelectToggle,
    onSelectAll,
    onToggleDateFormat,
    limit,
    dateFormat = 'standard',
    selectedCategoryInfo = null
}) {
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // Auto-sort by amount descending when a category is focused in the overview
    // Note: Since expenditures are negative numbers, 'asc' actually puts the largest expenditures at the top of the list!
    useEffect(() => {
        if (selectedCategoryInfo) {
            setSortConfig({ key: 'amount', direction: 'asc' });
        }
    }, [selectedCategoryInfo?.category]);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        if (dateFormat === 'friendly') {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            const dayName = days[date.getUTCDay()];
            const monthName = months[date.getUTCMonth()];
            const day = date.getUTCDate();

            let suffix = 'th';
            if (day % 10 === 1 && day !== 11) suffix = 'st';
            else if (day % 10 === 2 && day !== 12) suffix = 'nd';
            else if (day % 10 === 3 && day !== 13) suffix = 'rd';

            return `${dayName} ${monthName} ${day}${suffix}`;
        }
        return date.toLocaleDateString(undefined, { timeZone: 'UTC' });
    };

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
                            className="px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-colors group"
                            onClick={(e) => {
                                // Prevent sorting if the icon itself is clicked
                                if (e.target.closest('.date-toggle')) return;
                                requestSort('date');
                            }}
                        >
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleDateFormat?.();
                                    }}
                                    className="date-toggle p-1 rounded-md hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors mr-1"
                                    title="Toggle Date Format"
                                >
                                    <Calendar size={14} />
                                </button>
                                <span>Date</span>
                                <SortIndicator columnKey="date" />
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
                            onClick={() => requestSort('transaction_account')}
                        >
                            <div className="flex items-center gap-1">
                                Account <SortIndicator columnKey="transaction_account" />
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
                        {selectedCategoryInfo && (
                            <th className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                    % of Category
                                </div>
                            </th>
                        )}
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
                                {formatDate(tx.date)}
                            </td>
                            <td className="px-6 py-4">
                                {isEditingMode ? (
                                    <input
                                        className="w-full bg-transparent p-0 border-b border-dashed border-slate-400 hover:border-indigo-400 focus:border-solid focus:border-indigo-600 outline-none text-sm font-medium text-slate-900 transition-colors"
                                        value={editDrafts[tx.id]?.description ?? tx.description}
                                        onChange={(e) => onDraftChange(tx.id, 'description', e.target.value)}
                                        placeholder="Description..."
                                    />
                                ) : (
                                    <span className="text-sm font-medium text-slate-900 break-words block">
                                        {tx.description}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${tx.transaction_account?.toLowerCase()?.includes('credit') ? 'bg-indigo-50 text-indigo-700' :
                                    tx.transaction_account?.toLowerCase()?.includes('debit') ? 'bg-amber-50 text-amber-700' :
                                        'bg-slate-50 text-slate-700'
                                    }`}>
                                    {tx.transaction_account ? tx.transaction_account.toUpperCase() : 'UNKNOWN'}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {isEditingMode ? (
                                    <select
                                        className="appearance-none inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 focus:bg-white border border-transparent focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer transition-all"
                                        value={editDrafts[tx.id]?.category ?? (tx.category || '')}
                                        onChange={(e) => onDraftChange(tx.id, 'category', e.target.value)}
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
                            {selectedCategoryInfo && (() => {
                                const percent = selectedCategoryInfo.spend > 0
                                    ? (Math.abs(tx.amount) / selectedCategoryInfo.spend) * 100
                                    : 0;
                                return (
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-3 ml-auto">
                                            <span className="text-xs font-bold text-slate-700 w-10 text-right">
                                                {percent.toFixed(1)}%
                                            </span>
                                            <div className="relative w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                {/* Background proportion bar */}
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 transition-all duration-700 rounded-full"
                                                    style={{
                                                        width: `${Math.min(percent, 100)}%`,
                                                        backgroundColor: selectedCategoryInfo.color,
                                                        opacity: 0.6
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                );
                            })()}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
