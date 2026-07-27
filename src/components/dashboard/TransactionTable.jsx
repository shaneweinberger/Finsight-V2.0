import React, { useState, useMemo, useEffect } from 'react';
import { Edit2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown, Calendar } from 'lucide-react';
import SecondaryCategoryPicker, { SecondaryCategoryChips } from './SecondaryCategoryPicker';
import { normalizeSecondaryCategories } from '../../lib/secondaryCategories';

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
    selectedCategoryInfo = null,
    secondaryCategories = [],
    secondaryCategoryColor = () => '#64748b',
    onCreateSecondaryCategory,
    onRenameSecondaryCategory,
    onDeleteSecondaryCategory
}) {
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [columnOrder, setColumnOrder] = useState([
        'date',
        'description',
        'transaction_account',
        'category',
        'secondary_categories',
        'amount'
    ]);
    const [draggedColumn, setDraggedColumn] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);

    // Sync checkbox column if isEditingMode changes
    useEffect(() => {
        if (isEditingMode) {
            setColumnOrder(prev => prev.includes('checkbox') ? prev : ['checkbox', ...prev]);
        } else {
            setColumnOrder(prev => prev.filter(c => c !== 'checkbox'));
        }
    }, [isEditingMode]);

    // Sync percent column if selectedCategoryInfo changes
    useEffect(() => {
        if (selectedCategoryInfo) {
            setColumnOrder(prev => prev.includes('percent') ? prev : [...prev, 'percent']);
        } else {
            setColumnOrder(prev => prev.filter(c => c !== 'percent'));
        }
    }, [!!selectedCategoryInfo]);

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
                    aValue = new Date(a.effective_date).getTime();
                    bValue = new Date(b.effective_date).getTime();
                } else if (sortConfig.key === 'secondary_categories') {
                    // Untagged rows sort last regardless of direction
                    const aTags = normalizeSecondaryCategories(aValue);
                    const bTags = normalizeSecondaryCategories(bValue);
                    if (aTags.length === 0 && bTags.length === 0) return 0;
                    if (aTags.length === 0) return 1;
                    if (bTags.length === 0) return -1;
                    aValue = [...aTags].sort().join(', ').toLowerCase();
                    bValue = [...bTags].sort().join(', ').toLowerCase();
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
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-accent" /> : <ChevronDown size={14} className="text-accent" />;
    };

    const isAllSelected = displayTransactions.length > 0 && displayTransactions.every(tx => selectedIds.has(tx.id));
    const isSomeSelected = displayTransactions.some(tx => selectedIds.has(tx.id)) && !isAllSelected;

    // ── Drag and Drop Handlers ──────────────────────────────────────────────────
    const handleDragStart = (e, columnId) => {
        setDraggedColumn(columnId);
        e.dataTransfer.effectAllowed = 'move';
        // Set a transparent drag image or use default
    };

    const handleDragOver = (e, columnId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedColumn !== columnId) {
            setDropTarget(columnId);
        } else {
            setDropTarget(null);
        }
    };

    const handleDragLeave = () => {
        setDropTarget(null);
    };

    const handleDrop = (e, targetColumnId) => {
        e.preventDefault();
        setDropTarget(null);
        if (draggedColumn === targetColumnId) return;

        const newOrder = [...columnOrder];
        const draggedIdx = newOrder.indexOf(draggedColumn);
        const targetIdx = newOrder.indexOf(targetColumnId);

        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedColumn);

        setColumnOrder(newOrder);
        setDraggedColumn(null);
    };

    const handleDragEnd = () => {
        setDraggedColumn(null);
        setDropTarget(null);
    };

    // ── Column Components Mapping ───────────────────────────────────────────────
    const columnHeaders = {
        checkbox: (
            <th key="checkbox" className="px-6 py-4 w-10 sticky left-0 z-30 bg-slate-50/50">
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-accent focus:ring-accent-ring transition-all cursor-pointer"
                        checked={isAllSelected}
                        ref={el => el && (el.indeterminate = isSomeSelected)}
                        onChange={() => onSelectAll(displayTransactions.map(tx => tx.id))}
                    />
                </div>
            </th>
        ),
        date: (
            <th
                key="date"
                draggable
                onDragStart={(e) => handleDragStart(e, 'date')}
                onDragOver={(e) => handleDragOver(e, 'date')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'date')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-all group relative ${draggedColumn === 'date' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'date' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={(e) => {
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
                        className="date-toggle p-1 rounded-md hover:bg-accent-light text-slate-400 hover:text-accent transition-colors mr-1"
                        title="Toggle Date Format"
                    >
                        <Calendar size={14} />
                    </button>
                    <span>Date</span>
                    <SortIndicator columnKey="date" />
                </div>
            </th>
        ),
        description: (
            <th
                key="description"
                draggable
                onDragStart={(e) => handleDragStart(e, 'description')}
                onDragOver={(e) => handleDragOver(e, 'description')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'description')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'description' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'description' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={() => requestSort('description')}
            >
                <div className="flex items-center gap-1">
                    Description <SortIndicator columnKey="description" />
                </div>
            </th>
        ),
        transaction_account: (
            <th
                key="transaction_account"
                draggable
                onDragStart={(e) => handleDragStart(e, 'transaction_account')}
                onDragOver={(e) => handleDragOver(e, 'transaction_account')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'transaction_account')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'transaction_account' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'transaction_account' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={() => requestSort('transaction_account')}
            >
                <div className="flex items-center gap-1">
                    Account <SortIndicator columnKey="transaction_account" />
                </div>
            </th>
        ),
        category: (
            <th
                key="category"
                draggable
                onDragStart={(e) => handleDragStart(e, 'category')}
                onDragOver={(e) => handleDragOver(e, 'category')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'category')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'category' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'category' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={() => requestSort('category')}
            >
                <div className="flex items-center gap-1">
                    Category <SortIndicator columnKey="category" />
                </div>
            </th>
        ),
        secondary_categories: (
            <th
                key="secondary_categories"
                draggable
                onDragStart={(e) => handleDragStart(e, 'secondary_categories')}
                onDragOver={(e) => handleDragOver(e, 'secondary_categories')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'secondary_categories')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'secondary_categories' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'secondary_categories' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={() => requestSort('secondary_categories')}
            >
                <div className="flex items-center gap-1">
                    Secondary <SortIndicator columnKey="secondary_categories" />
                </div>
            </th>
        ),
        amount: (
            <th
                key="amount"
                draggable
                onDragStart={(e) => handleDragStart(e, 'amount')}
                onDragOver={(e) => handleDragOver(e, 'amount')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'amount')}
                onDragEnd={handleDragEnd}
                className={`pl-6 pr-16 py-4 text-right cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'amount' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'amount' ? 'border-l-2 border-emerald-500' : ''}`}
                onClick={() => requestSort('amount')}
            >
                <div className="flex items-center justify-end gap-1">
                    Amount <SortIndicator columnKey="amount" />
                </div>
            </th>
        ),
        percent: selectedCategoryInfo ? (
            <th
                key="percent"
                draggable
                onDragStart={(e) => handleDragStart(e, 'percent')}
                onDragOver={(e) => handleDragOver(e, 'percent')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'percent')}
                onDragEnd={handleDragEnd}
                className={`px-6 py-4 text-right cursor-pointer hover:bg-slate-100/50 transition-all relative ${draggedColumn === 'percent' ? 'opacity-40 bg-slate-100' : ''} ${dropTarget === 'percent' ? 'border-l-2 border-emerald-500' : ''}`}
            >
                <div className="flex items-center justify-end gap-1">
                    % of Category
                </div>
            </th>
        ) : null
    };

    const renderCell = (columnId, tx) => {
        switch (columnId) {
            case 'checkbox':
                return (
                    <td key="checkbox" className="px-6 py-4 sticky left-0 z-20 bg-inherit shadow-[1px_0_0_0_rgba(226,232,240,1)]">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-accent focus:ring-accent-ring transition-all cursor-pointer"
                                checked={selectedIds.has(tx.id)}
                                onChange={() => onSelectToggle(tx.id)}
                            />
                        </div>
                    </td>
                );
            case 'date': {
                const effectiveDate = tx.effective_date;
                const isOverridden = !!tx.recognized_date;
                
                // Determine the value to show in the date picker.
                // If the user has clicked Reset (null), it should revert to showing the original transaction date.
                let editValue = effectiveDate;
                if (editDrafts[tx.id] && 'recognized_date' in editDrafts[tx.id]) {
                    editValue = editDrafts[tx.id].recognized_date || tx.transaction_date;
                }

                return (
                    <td key="date" className="px-6 py-4 text-sm font-medium">
                        {isEditingMode ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    className="w-[125px] bg-transparent p-1 -ml-1 border border-dashed border-slate-300 rounded hover:border-accent-border focus:border-solid focus:border-accent outline-none text-sm font-medium text-slate-900 transition-colors"
                                    value={editValue}
                                    onChange={(e) => onDraftChange(tx.id, 'recognized_date', e.target.value || null)}
                                />
                                {isOverridden && (
                                    <button 
                                        onClick={() => onDraftChange(tx.id, 'recognized_date', null)}
                                        className="text-slate-400 hover:text-rose-500 rounded p-1 transition-colors bg-slate-100 hover:bg-rose-50"
                                        title="Reset to original transaction date"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 group">
                                <span className={`text-slate-500 transition-colors ${isOverridden ? 'text-accent font-bold' : ''}`}>
                                    {formatDate(effectiveDate)}
                                </span>
                                {isOverridden && (
                                    <div className="relative group/tooltip flex items-center justify-center w-4 h-4 cursor-help">
                                        {/* The visible dot */}
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-in zoom-in" />
                                        
                                        {/* The custom popover tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover/tooltip:opacity-100 group-hover/tooltip:-translate-y-1 min-w-max pointer-events-none transition-all duration-200 bg-slate-800 text-white text-[10px] font-bold px-3 py-2 rounded-lg shadow-xl z-50">
                                            <div className="flex flex-col gap-1 text-left">
                                                <div className="flex justify-between gap-3">
                                                    <span className="font-medium">Original</span>
                                                    <span>{formatDate(tx.transaction_date)}</span>
                                                </div>
                                                <div className="flex justify-between gap-3">
                                                    <span className="font-medium">Recognized</span>
                                                    <span>{formatDate(tx.recognized_date)}</span>
                                                </div>
                                            </div>
                                            {/* Tooltip arrow */}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </td>
                );
            }
            case 'description':
                return (
                    <td key="description" className="px-6 py-4">
                        {isEditingMode ? (
                            <input
                                className="w-full bg-transparent p-0 border-b border-dashed border-slate-400 hover:border-accent-border focus:border-solid focus:border-accent outline-none text-sm font-medium text-slate-900 transition-colors"
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
                );
            case 'transaction_account':
                return (
                    <td key="transaction_account" className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-tight ${tx.transaction_account?.toLowerCase()?.includes('credit') ? 'bg-accent-light text-accent-light-text' :
                            tx.transaction_account?.toLowerCase()?.includes('debit') ? 'bg-amber-50 text-amber-700' :
                                'bg-slate-50 text-slate-700'
                            }`}>
                            {tx.transaction_account ? tx.transaction_account.toUpperCase() : 'UNKNOWN'}
                        </span>
                    </td>
                );
            case 'category':
                return (
                    <td key="category" className="px-6 py-4">
                        {isEditingMode ? (
                            <select
                                className="appearance-none inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 focus:bg-white border border-transparent focus:border-accent-border focus:ring-2 focus:ring-accent-ring outline-none cursor-pointer transition-all"
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
                );
            case 'secondary_categories': {
                const current = editDrafts[tx.id]?.secondary_categories ?? tx.secondary_categories;
                return (
                    <td key="secondary_categories" className="px-6 py-4 min-w-[180px]">
                        {isEditingMode ? (
                            <SecondaryCategoryPicker
                                value={current}
                                options={secondaryCategories}
                                colorFor={secondaryCategoryColor}
                                onChange={(next) => onDraftChange(tx.id, 'secondary_categories', next)}
                                onCreate={onCreateSecondaryCategory}
                                onRename={onRenameSecondaryCategory}
                                onDelete={onDeleteSecondaryCategory}
                            />
                        ) : (
                            <SecondaryCategoryChips names={current} colorFor={secondaryCategoryColor} />
                        )}
                    </td>
                );
            }
            case 'amount':
                return (
                    <td key="amount" className={`pl-6 pr-16 py-4 text-sm font-bold text-right ${parseFloat(tx.amount) > 0 ? 'text-emerald-600' : 'text-slate-900'
                        }`}>
                        {parseFloat(tx.amount) > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                    </td>
                );
            case 'percent': {
                if (!selectedCategoryInfo) return null;
                const txAmt = parseFloat(tx.amount);
                const isInflow = txAmt > 0;
                const percent = (!isInflow && selectedCategoryInfo.spend > 0)
                    ? (Math.abs(txAmt) / selectedCategoryInfo.spend) * 100
                    : 0;
                return (
                    <td key="percent" className="px-6 py-4">
                        {isInflow ? (
                            <div className="flex items-center justify-end pr-2">
                                <span className="text-xs text-slate-300 font-medium">—</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-end gap-3 ml-auto">
                                <span className="text-xs font-bold text-slate-700 w-10 text-right">
                                    {percent.toFixed(1)}%
                                </span>
                                <div className="relative w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
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
                        )}
                    </td>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                    <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase tracking-wider select-none">
                        {columnOrder.map(colId => columnHeaders[colId])}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {displayTransactions.map((tx) => (
                        <tr
                            key={tx.id}
                            className={`hover:bg-slate-50/50 transition-colors group relative ${selectedIds.has(tx.id) ? 'bg-accent-light/20' : ''}`}
                        >
                            {columnOrder.map(colId => renderCell(colId, tx))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
