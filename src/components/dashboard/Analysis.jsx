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
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Plus,
    X,
    ChevronDown,
    CircleSlash,
    Check,
    Tag
} from 'lucide-react';

export default function Analysis() {
    // Current filter mode: 'all', 'week', 'month', 'range'
    const [filterType, setFilterType] = useState('range');

    // Date Range from context (Default fallback or initial)
    const { startDate: ctxStartDate, endDate: ctxEndDate } = useOutletContext();

    // Local state for specific filters
    const [localStartDate, setLocalStartDate] = useState(ctxStartDate);
    const [localEndDate, setLocalEndDate] = useState(ctxEndDate);
    const [selectedWeek, setSelectedWeek] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');

    // Table view state
    const [dateFormat, setDateFormat] = useState('standard');
    // Column Filters state - transformed to dynamic array
    const [advancedFilters, setAdvancedFilters] = useState([]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [activeValuePopover, setActiveValuePopover] = useState(null); // id of filter whose value popover is open

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ description: '', category: '' });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    // Generate recent weeks for the selector
    const getWeekOptions = () => {
        const weeks = [];
        const now = new Date();
        // Go back to the most recent Monday
        const current = new Date(now);
        current.setDate(now.getDate() - ((now.getDay() + 6) % 7));

        for (let i = 0; i < 12; i++) {
            const start = new Date(current);
            start.setDate(current.getDate() - (i * 7));
            const end = new Date(start);
            end.setDate(start.getDate() + 6);

            const startStr = start.toISOString().split('T')[0];
            const endStr = end.toISOString().split('T')[0];

            weeks.push({
                start: startStr,
                end: endStr,
                label: `Week of ${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
            });
        }
        return weeks;
    };

    // Generate recent months for the selector
    const getMonthOptions = () => {
        const months = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            months.push({ value: val, label });
        }
        return months;
    };

    useEffect(() => {
        const weeks = getWeekOptions();
        const months = getMonthOptions();
        if (!selectedWeek) setSelectedWeek(weeks[0].start);
        if (!selectedMonth) setSelectedMonth(months[0].value);
    }, []);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page on filter change
        fetchData();
    }, [filterType, localStartDate, localEndDate, selectedWeek, selectedMonth]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchCategories()]);
        setLoading(false);
    };

    const fetchTransactions = async () => {
        try {
            let query = supabase
                .from('silver_transactions')
                .select('*')
                .order('date', { ascending: false });

            if (filterType !== 'all') {
                let start, end;
                if (filterType === 'week') {
                    start = selectedWeek;
                    const d = new Date(selectedWeek);
                    d.setDate(d.getDate() + 6);
                    end = d.toISOString().split('T')[0];
                } else if (filterType === 'month') {
                    const [year, month] = selectedMonth.split('-');
                    start = `${year}-${month}-01`;
                    // Get last day of month
                    const d = new Date(year, month, 0);
                    end = `${year}-${month}-${String(d.getDate()).padStart(2, '0')}`;
                } else if (filterType === 'range') {
                    start = localStartDate;
                    end = localEndDate;
                }

                if (start) query = query.gte('date', start);
                if (end) query = query.lte('date', end);
            }

            const { data, error } = await query;

            if (error) throw error;
            setTransactions(data || []);
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

    const addFilter = (field) => {
        const id = Math.random().toString(36).substr(2, 9);
        let operator = 'includes';
        let value = '';

        if (field === 'amount') operator = 'gt';
        if (field === 'transaction_method') {
            operator = 'is';
            value = ['credit'];
        }
        if (field === 'category') {
            operator = 'is';
            value = ['Uncategorized'];
        }

        setAdvancedFilters([...advancedFilters, { id, field, operator, value }]);
        setShowFilterMenu(false);
    };

    const removeFilter = (id) => {
        setAdvancedFilters(advancedFilters.filter(f => f.id !== id));
    };

    const updateFilter = (id, updates) => {
        setAdvancedFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const filteredTransactions = React.useMemo(() => {
        return transactions.filter(tx => {
            for (const filter of advancedFilters) {
                const { field, operator, value } = filter;
                if (value === '' && !['is', 'isNot'].includes(operator)) continue;

                const txValue = tx[field];

                if (field === 'description') {
                    const desc = (txValue || '').toLowerCase();
                    const val = value.toLowerCase();
                    if (operator === 'is' && desc !== val) return false;
                    if (operator === 'isNot' && desc === val) return false;
                    if (operator === 'includes' && !desc.includes(val)) return false;
                }

                if (field === 'transaction_method') {
                    const type = (txValue || '').toLowerCase();
                    const valArray = Array.isArray(value) ? value : [value];
                    const isMatch = valArray.map(v => v.toLowerCase()).includes(type);
                    if (operator === 'is' && !isMatch) return false;
                    if (operator === 'isNot' && isMatch) return false;
                }

                if (field === 'category') {
                    const cat = (txValue || 'Uncategorized').toLowerCase();
                    const valArray = (Array.isArray(value) ? value : [value]).map(v => v.toLowerCase());
                    const isMatch = valArray.includes(cat);
                    if (operator === 'is' && !isMatch) return false;
                    if (operator === 'isNot' && isMatch) return false;
                }

                if (field === 'amount') {
                    const amt = Math.abs(parseFloat(txValue));
                    const val = parseFloat(value);
                    if (isNaN(val)) continue;
                    if (operator === 'gt' && !(amt > val)) return false;
                    if (operator === 'lt' && !(amt < val)) return false;
                    if (operator === 'eq' && !(amt === val)) return false;
                }
            }
            return true;
        });
    }, [transactions, advancedFilters]);

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
        <div
            className="space-y-8 animate-in fade-in duration-700"
            onClick={() => {
                setShowFilterMenu(false);
                setActiveValuePopover(null);
            }}
        >
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Transaction Analysis</h1>
                    <p className="text-slate-500 mt-1">Deep dive into your financial history with advanced filtering.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Filter Type Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {[
                            { id: 'range', label: 'Date Range' },
                            { id: 'week', label: 'Week' },
                            { id: 'month', label: 'Month' },
                            { id: 'all', label: 'All' }
                        ].map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setFilterType(type.id)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${filterType === type.id
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    {/* Dynamic Filter Inputs */}
                    <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm min-h-[44px]">
                        {filterType === 'range' && (
                            <>
                                <div className="flex items-center gap-2 px-3">
                                    <Calendar size={16} className="text-slate-400" />
                                    <input
                                        type="date"
                                        value={localStartDate}
                                        onChange={(e) => setLocalStartDate(e.target.value)}
                                        className="text-sm font-medium text-slate-700 outline-none w-32"
                                    />
                                </div>
                                <div className="text-slate-300">|</div>
                                <div className="flex items-center gap-2 px-3">
                                    <input
                                        type="date"
                                        value={localEndDate}
                                        onChange={(e) => setLocalEndDate(e.target.value)}
                                        className="text-sm font-medium text-slate-700 outline-none w-32"
                                    />
                                </div>
                            </>
                        )}

                        {filterType === 'week' && (
                            <div className="flex items-center gap-3 px-3 min-w-[300px]">
                                <Calendar size={16} className="text-slate-400" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5 leading-none">(Monday to Sunday)</span>
                                    <select
                                        value={selectedWeek}
                                        onChange={(e) => setSelectedWeek(e.target.value)}
                                        className="text-sm font-medium text-slate-700 outline-none bg-transparent w-full cursor-pointer"
                                    >
                                        {getWeekOptions().map(w => (
                                            <option key={w.start} value={w.start}>{w.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {filterType === 'month' && (
                            <div className="flex items-center gap-2 px-3 min-w-[180px]">
                                <Calendar size={16} className="text-slate-400" />
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="text-sm font-medium text-slate-700 outline-none bg-transparent w-full cursor-pointer"
                                >
                                    {getMonthOptions().map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {filterType === 'all' && (
                            <div className="flex items-center gap-2 px-4 py-1">
                                <Filter size={16} className="text-indigo-500" />
                                <span className="text-sm font-semibold text-slate-600">All Transactions</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col relative z-20">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-slate-900">Filtered Transactions</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {filteredTransactions.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* New Notion-style Filter Toggle */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowFilterMenu(!showFilterMenu);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all border ${showFilterMenu || advancedFilters.length > 0
                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm'
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                                    }`}
                            >
                                <Plus size={16} />
                                Filter
                            </button>

                            {showFilterMenu && (
                                <div
                                    className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 py-2 animate-in zoom-in-95 duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">
                                        Filter by:
                                    </div>
                                    {[
                                        { field: 'description', label: 'Description', icon: Search },
                                        { field: 'transaction_method', label: 'Type', icon: Filter },
                                        { field: 'category', label: 'Category', icon: Tag },
                                        { field: 'amount', label: 'Amount', icon: ArrowUpDown }
                                    ].map(opt => (
                                        <button
                                            key={opt.field}
                                            disabled={advancedFilters.some(f => f.field === opt.field)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                addFilter(opt.field);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:grayscale disabled:hover:bg-transparent text-left"
                                        >
                                            <opt.icon size={16} className="text-slate-400" />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

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

                {/* Active Filter Chips */}
                {advancedFilters.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
                        {advancedFilters.map((filter) => (
                            <div
                                key={filter.id}
                                className="flex items-center gap-0 bg-white border border-slate-200 rounded-lg shadow-sm animate-in slide-in-from-left duration-200"
                            >
                                <div className="pl-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                                    {filter.field === 'transaction_method' ? 'Type' : filter.field}:
                                </div>
                                <div className="flex items-center">
                                    {/* Operator Select */}
                                    <select
                                        value={filter.operator}
                                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                                        className="text-xs font-bold text-indigo-600 bg-transparent px-2 py-1.5 outline-none hover:bg-indigo-50/50 cursor-pointer appearance-none text-center"
                                        style={{ width: filter.operator.length * 7 + 20 }}
                                    >
                                        {filter.field === 'amount' ? (
                                            <>
                                                <option value="gt">&gt;</option>
                                                <option value="lt">&lt;</option>
                                                <option value="eq">=</option>
                                            </>
                                        ) : filter.field === 'description' ? (
                                            <>
                                                <option value="includes">contains</option>
                                                <option value="is">is</option>
                                                <option value="isNot">is not</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="is">is</option>
                                                <option value="isNot">is not</option>
                                            </>
                                        )}
                                    </select>

                                    {/* Value Input */}
                                    <div className="border-l border-slate-100 flex items-center relative">
                                        {filter.field === 'transaction_method' || filter.field === 'category' ? (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveValuePopover(activeValuePopover === filter.id ? null : filter.id);
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors w-full text-left overflow-hidden max-w-[200px]"
                                                >
                                                    <span className="text-xs font-semibold text-slate-700 truncate">
                                                        {filter.value.length === 0
                                                            ? 'Select...'
                                                            : filter.value.length === 1
                                                                ? filter.value[0].toUpperCase()
                                                                : `${filter.value.length} selected`}
                                                    </span>
                                                    <ChevronDown size={12} className={`text-slate-400 transition-transform ${activeValuePopover === filter.id ? 'rotate-180' : ''}`} />
                                                </button>

                                                {activeValuePopover === filter.id && (
                                                    <div
                                                        className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] py-2 animate-in zoom-in-95 duration-200 max-h-64 overflow-y-auto"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {(filter.field === 'transaction_method' ? ['credit', 'debit'] : ['Uncategorized', ...categories]).map(opt => {
                                                            const isSelected = filter.value.includes(opt);
                                                            return (
                                                                <label
                                                                    key={opt}
                                                                    className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                                                                >
                                                                    <div className="relative flex items-center justify-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="peer h-4 w-4 appearance-none rounded border border-slate-300 checked:border-indigo-600 checked:bg-indigo-600 transition-all cursor-pointer"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                e.stopPropagation();
                                                                                const next = isSelected
                                                                                    ? filter.value.filter(v => v !== opt)
                                                                                    : [...filter.value, opt];
                                                                                updateFilter(filter.id, { value: next });
                                                                            }}
                                                                        />
                                                                        <Check size={12} className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none" />
                                                                    </div>
                                                                    <span className="text-sm font-medium text-slate-700">
                                                                        {opt === 'Uncategorized' ? 'None' : opt.toUpperCase()}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <input
                                                type={filter.field === 'amount' ? 'number' : 'text'}
                                                value={filter.value}
                                                placeholder="Type a value..."
                                                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                                                className="text-xs font-semibold text-slate-700 bg-transparent px-3 py-1.5 outline-none hover:bg-slate-50 min-w-[80px] max-w-[150px]"
                                            />
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFilter(filter.id);
                                    }}
                                    className="px-2 py-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors border-l border-slate-100"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={() => setAdvancedFilters([])}
                            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
                        >
                            <CircleSlash size={12} />
                            Reset
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex-1 flex items-center justify-center p-20">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-indigo-600" size={40} />
                            <p className="text-slate-500 font-medium">Loading transactions...</p>
                        </div>
                    </div>
                ) : filteredTransactions.length > 0 ? (
                    <>
                        <div className="flex-1">
                            <TransactionTable
                                transactions={filteredTransactions.slice(
                                    (currentPage - 1) * (itemsPerPage === 'all' ? 0 : itemsPerPage),
                                    itemsPerPage === 'all' ? undefined : currentPage * itemsPerPage
                                )}
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
                                dateFormat={dateFormat}
                                onToggleDateFormat={() => setDateFormat(prev => prev === 'standard' ? 'friendly' : 'standard')}
                            />
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-500">Show</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
                                            setItemsPerPage(val);
                                            setCurrentPage(1);
                                        }}
                                        className="text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value="all">All</option>
                                    </select>
                                    <span className="text-sm text-slate-500">per page</span>
                                </div>
                                <div className="text-sm text-slate-400 hidden md:block">|</div>
                                <div className="text-sm text-slate-500">
                                    Showing <span className="font-semibold text-slate-700">
                                        {itemsPerPage === 'all' ? 1 : (currentPage - 1) * itemsPerPage + 1}
                                    </span> to <span className="font-semibold text-slate-700">
                                        {itemsPerPage === 'all' ? filteredTransactions.length : Math.min(currentPage * itemsPerPage, filteredTransactions.length)}
                                    </span> of <span className="font-semibold text-slate-700">{filteredTransactions.length}</span> items
                                </div>
                            </div>

                            {itemsPerPage !== 'all' && filteredTransactions.length > itemsPerPage && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronsLeft size={18} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <div className="flex items-center px-2">
                                        <span className="text-sm text-slate-500">
                                            Page <span className="font-semibold text-slate-700">{currentPage}</span> of <span className="font-semibold text-slate-700">{Math.ceil(filteredTransactions.length / itemsPerPage)}</span>
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), prev + 1))}
                                        disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(Math.ceil(filteredTransactions.length / itemsPerPage))}
                                        disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                    >
                                        <ChevronsRight size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
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
