import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Check, Pencil, Trash2, Loader2 } from 'lucide-react';
import { normalizeSecondaryCategories } from '../../lib/secondaryCategories';

// ─── Read-only chip row ──────────────────────────────────────────────────────
export function SecondaryCategoryChips({ names, colorFor, emptyLabel = '—' }) {
    const list = normalizeSecondaryCategories(names);
    if (list.length === 0) {
        return <span className="text-xs text-slate-300 font-medium">{emptyLabel}</span>;
    }
    return (
        <div className="flex flex-wrap items-center gap-1">
            {list.map(name => (
                <span
                    key={name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border max-w-[160px]"
                    style={{
                        color: colorFor(name),
                        borderColor: `${colorFor(name)}33`,
                        backgroundColor: `${colorFor(name)}14`
                    }}
                >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(name) }} />
                    <span className="truncate">{name}</span>
                </span>
            ))}
        </div>
    );
}

// ─── Editable multi-select popover ───────────────────────────────────────────
export default function SecondaryCategoryPicker({
    value,
    options = [],
    colorFor,
    onChange,
    onCreate,
    onRename,
    onDelete
}) {
    const selected = normalizeSecondaryCategories(value);
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [position, setPosition] = useState(null);
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [error, setError] = useState(null);

    const triggerRef = useRef(null);
    const popoverRef = useRef(null);
    const searchRef = useRef(null);

    const PANEL_WIDTH = 256;
    const PANEL_MAX_HEIGHT = 320;

    const openPanel = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Fixed positioning + portal: the transactions table scrolls horizontally,
        // which would clip an absolutely-positioned panel.
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
        setPosition({
            left: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12),
            top: flipUp ? undefined : rect.bottom + 6,
            bottom: flipUp ? window.innerHeight - rect.top + 6 : undefined
        });
        setSearch('');
        setError(null);
        setEditingId(null);
        setIsOpen(true);
    };

    useEffect(() => {
        if (isOpen) searchRef.current?.focus();
    }, [isOpen]);

    // Close on outside click / Esc / scroll of any ancestor
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (e) => {
            if (popoverRef.current?.contains(e.target)) return;
            if (triggerRef.current?.contains(e.target)) return;
            setIsOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setIsOpen(false); } };
        const onScroll = () => setIsOpen(false);
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o => o.name.toLowerCase().includes(q));
    }, [options, search]);

    const exactMatch = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? options.some(o => o.name.toLowerCase() === q) : true;
    }, [options, search]);

    const toggle = (name) => {
        const isOn = selected.some(s => s === name);
        onChange(isOn ? selected.filter(s => s !== name) : [...selected, name]);
    };

    const handleCreate = async () => {
        const name = search.trim();
        if (!name || busy) return;
        setBusy(true);
        setError(null);
        try {
            await onCreate(name);
            onChange([...selected, name]);
            setSearch('');
            searchRef.current?.focus();
        } catch (err) {
            setError(err.message || 'Could not create that tag.');
        } finally {
            setBusy(false);
        }
    };

    const handleRename = async (option) => {
        const next = editingName.trim();
        if (!next || next === option.name) { setEditingId(null); return; }
        setBusy(true);
        setError(null);
        try {
            await onRename(option, next);
            if (selected.includes(option.name)) {
                onChange(selected.map(s => (s === option.name ? next : s)));
            }
            setEditingId(null);
        } catch (err) {
            setError(err.message || 'Could not rename that tag.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (option) => {
        if (!confirm(`Delete "${option.name}"? It will be removed from every transaction it's applied to.`)) return;
        setBusy(true);
        setError(null);
        try {
            await onDelete(option);
            onChange(selected.filter(s => s !== option.name));
        } catch (err) {
            setError(err.message || 'Could not delete that tag.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); isOpen ? setIsOpen(false) : openPanel(); }}
                className={`flex flex-wrap items-center gap-1 min-h-[26px] w-full text-left px-1.5 py-0.5 rounded-lg border border-dashed transition-colors ${isOpen ? 'border-accent bg-accent-light/30' : 'border-slate-300 hover:border-accent-border hover:bg-slate-50'
                    }`}
            >
                {selected.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Plus size={12} />Tag
                    </span>
                ) : (
                    <SecondaryCategoryChips names={selected} colorFor={colorFor} />
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed z-[9999] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-300/40 animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: position.left, top: position.top, bottom: position.bottom, width: PANEL_WIDTH }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-2 border-b border-slate-100">
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (!exactMatch) handleCreate();
                                }
                            }}
                            placeholder="Search or create…"
                            className="w-full text-sm px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-accent-ring focus:border-accent-border placeholder:text-slate-400"
                        />
                    </div>

                    {error && (
                        <div className="px-3 py-2 text-[11px] font-semibold text-rose-600 bg-rose-50 border-b border-rose-100">
                            {error}
                        </div>
                    )}

                    <div className="max-h-[220px] overflow-y-auto py-1">
                        {filteredOptions.length === 0 && exactMatch && (
                            <p className="px-3 py-4 text-xs text-slate-400 text-center">
                                No secondary categories yet — type a name to create one.
                            </p>
                        )}

                        {filteredOptions.map(option => {
                            const isSelected = selected.includes(option.name);
                            const isEditing = editingId === option.id;

                            if (isEditing) {
                                return (
                                    <div key={option.id} className="flex items-center gap-1.5 px-2 py-1.5">
                                        <input
                                            autoFocus
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); handleRename(option); }
                                                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                                            }}
                                            className="flex-1 min-w-0 text-sm px-2 py-1 bg-white border border-accent-border rounded-lg outline-none focus:ring-2 focus:ring-accent-ring"
                                        />
                                        <button
                                            onClick={() => handleRename(option)}
                                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                                        >
                                            <Check size={13} />
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="p-1 text-slate-400 hover:bg-slate-100 rounded-md transition-colors"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={option.id}
                                    className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
                                    onClick={() => toggle(option.name)}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accent border-accent' : 'bg-white border-slate-300 group-hover:border-accent'
                                        }`}>
                                        {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                                    </div>
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(option.name) }} />
                                    <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{option.name}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingId(option.id); setEditingName(option.name); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-accent rounded-md transition-all"
                                        title="Rename"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(option); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded-md transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {!exactMatch && (
                        <button
                            onClick={handleCreate}
                            disabled={busy}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-accent hover:bg-accent-light/40 border-t border-slate-100 transition-colors disabled:opacity-50"
                        >
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                            Create “{search.trim()}”
                        </button>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
