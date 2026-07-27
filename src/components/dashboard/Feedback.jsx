import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
    Plus, Bug, Sparkles, Palette, HelpCircle, ChevronUp, X,
    Loader2, CheckCircle2, Clock, AlertCircle, Send, Trash2, Edit2
} from 'lucide-react';
import { theme } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const TICKET_TYPES = [
    { value: 'bugfix',         label: 'Bug Fix',       icon: Bug,      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.25)' },
    { value: 'feature',        label: 'Feature',       icon: Sparkles, color: '#10b981', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.25)' },
    { value: 'ui_improvement', label: 'UI Improvement',icon: Palette,  color: '#6366f1', bg: 'rgba(99,102,241,0.12)',   border: 'rgba(99,102,241,0.25)' },
    { value: 'other',          label: 'Other',         icon: HelpCircle,color: '#94a3b8',bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' },
];

const PAGES = [
    'Overview',
    'Analysis',
    'Budgeting',
    'Transaction Uploads',
    'AI Rules',
    'Getting Started',
    'Other',
];

const STATUS_TABS = [
    { value: 'submitted',   label: 'Submitted',   icon: Send },
    { value: 'in_progress', label: 'In Progress', icon: Clock },
    { value: 'complete',    label: 'Complete',    icon: CheckCircle2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTypeConfig(value) {
    return TICKET_TYPES.find(t => t.value === value) || TICKET_TYPES[3];
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    const days = Math.floor(diff / 86400);
    if (days < 30)   return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type, small = false }) {
    const cfg = getTypeConfig(type);
    const Icon = cfg.icon;
    return (
        <span
            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
            className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
        >
            <Icon size={small ? 10 : 11} />
            {cfg.label}
        </span>
    );
}

function VoteButton({ count, voted, onVote, disabled }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={e => { e.stopPropagation(); onVote(); }}
            disabled={disabled}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                backgroundColor: voted
                    ? 'rgba(16,185,129,0.15)'
                    : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${voted ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: voted ? '#10b981' : '#94a3b8',
                cursor: disabled ? 'default' : 'pointer',
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
        >
            <ChevronUp size={13} className={`transition-transform ${voted ? 'scale-110' : ''}`} />
            {count}
        </button>
    );
}

function TicketCard({ ticket, currentUserId, onVote, onDelete, onEdit }) {
    const voted   = ticket.user_has_voted;
    const isOwner = currentUserId && ticket.user_id === currentUserId;
    const canEdit = isOwner && ticket.status === 'submitted';
    const cfg     = getTypeConfig(ticket.type);
    const [deleteHovered, setDeleteHovered] = useState(false);
    const [editHovered, setEditHovered] = useState(false);

    return (
        <div
            style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #333',
                borderLeft: `3px solid ${cfg.color}`,
            }}
            className="rounded-xl p-4 flex flex-col gap-3 hover:border-[#404040] transition-all duration-200"
        >
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <TypeBadge type={ticket.type} />
                    <span
                        style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    >
                        {ticket.page}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {canEdit && (
                        <button
                            onClick={e => { e.stopPropagation(); onEdit(ticket); }}
                            onMouseEnter={() => setEditHovered(true)}
                            onMouseLeave={() => setEditHovered(false)}
                            style={{
                                backgroundColor: editHovered ? 'rgba(99,102,241,0.12)' : 'transparent',
                                color: editHovered ? '#818cf8' : '#4b5563',
                            }}
                            className="p-1.5 rounded-lg transition-all duration-150"
                            title="Edit your ticket"
                        >
                            <Edit2 size={13} />
                        </button>
                    )}
                    {isOwner && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(ticket.id); }}
                            onMouseEnter={() => setDeleteHovered(true)}
                            onMouseLeave={() => setDeleteHovered(false)}
                            style={{
                                backgroundColor: deleteHovered ? 'rgba(239,68,68,0.12)' : 'transparent',
                                color: deleteHovered ? '#f87171' : '#4b5563',
                            }}
                            className="p-1.5 rounded-lg transition-all duration-150"
                            title="Delete your ticket"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    <VoteButton
                        count={ticket.vote_count}
                        voted={voted}
                        onVote={() => onVote(ticket.id, voted)}
                        disabled={!currentUserId}
                    />
                </div>
            </div>

            {/* Description */}
            <p style={{ color: '#d1d5db' }} className="text-sm leading-relaxed line-clamp-3">
                {ticket.description}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between">
                <p style={{ color: '#6b7280' }} className="text-[11px]">
                    {timeAgo(ticket.created_at)} ·{' '}
                    {ticket.vote_count === 1 ? '1 upvote' : `${ticket.vote_count} upvotes`}
                </p>
                {isOwner && (
                    <span style={{ color: '#4b5563' }} className="text-[10px] italic">You</span>
                )}
            </div>
        </div>
    );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ ticket, onClose, onSuccess }) {
    const [type, setType]               = useState(ticket.type);
    const [page, setPage]               = useState(ticket.page);
    const [description, setDescription] = useState(ticket.description);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');

    const handleSubmit = async () => {
        if (!description.trim()) { setError('Please write a description.'); return; }
        setLoading(true);
        setError('');
        const { error: err } = await supabase
            .from('feedback_tickets')
            .update({
                type,
                page,
                description: description.trim(),
            })
            .eq('id', ticket.id);
        setLoading(false);
        if (err) { setError('Failed to save. Please try again.'); return; }
        onSuccess();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <div
                style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', maxWidth: '520px' }}
                className="w-full rounded-2xl shadow-2xl flex flex-col animate-fade-in-up"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: '#2e2e2e' }}>
                    <h2 style={{ color: '#f1f5f9' }} className="text-lg font-bold">Edit Feedback</h2>
                    <button
                        onClick={onClose}
                        style={{ color: '#6b7280' }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-5 overflow-y-auto">
                    {/* Type selector */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            {TICKET_TYPES.map(({ value, label, icon: Icon, color, bg, border }) => {
                                const sel = type === value;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setType(value)}
                                        style={{
                                            backgroundColor: sel ? bg : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${sel ? border : 'rgba(255,255,255,0.08)'}`,
                                            color: sel ? color : '#9ca3af',
                                        }}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                                    >
                                        <Icon size={15} />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Page selector */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Page</label>
                        <select
                            value={page}
                            onChange={e => setPage(e.target.value)}
                            style={{
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #3a3a3a',
                                color: '#e2e8f0',
                            }}
                            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-600 transition-colors"
                        >
                            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe what you found or what you'd like to see..."
                            rows={4}
                            style={{
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #3a3a3a',
                                color: '#e2e8f0',
                                resize: 'none',
                            }}
                            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-600 transition-colors placeholder:text-[#4b5563]"
                        />
                    </div>

                    {error && (
                        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 pt-0 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        style={{ color: '#6b7280', border: '1px solid #333' }}
                        className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{ backgroundColor: '#034638', color: '#fff' }}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {loading ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Submit Modal ──────────────────────────────────────────────────────────────

function SubmitModal({ currentUserId, onClose, onSuccess }) {
    const [type, setType]               = useState('bugfix');
    const [page, setPage]               = useState('Overview');
    const [description, setDescription] = useState('');
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');

    const handleSubmit = async () => {
        if (!description.trim()) { setError('Please write a description.'); return; }
        setLoading(true);
        setError('');
        const { error: err } = await supabase.from('feedback_tickets').insert({
            user_id: currentUserId,
            type,
            page,
            description: description.trim(),
            status: 'submitted',
        });
        setLoading(false);
        if (err) { setError('Failed to submit. Please try again.'); return; }
        onSuccess();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <div
                style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', maxWidth: '520px' }}
                className="w-full rounded-2xl shadow-2xl flex flex-col animate-fade-in-up"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: '#2e2e2e' }}>
                    <h2 style={{ color: '#f1f5f9' }} className="text-lg font-bold">Submit Feedback</h2>
                    <button
                        onClick={onClose}
                        style={{ color: '#6b7280' }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-5 overflow-y-auto">
                    {/* Type selector */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            {TICKET_TYPES.map(({ value, label, icon: Icon, color, bg, border }) => {
                                const sel = type === value;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setType(value)}
                                        style={{
                                            backgroundColor: sel ? bg : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${sel ? border : 'rgba(255,255,255,0.08)'}`,
                                            color: sel ? color : '#9ca3af',
                                        }}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                                    >
                                        <Icon size={15} />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Page selector */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Page</label>
                        <select
                            value={page}
                            onChange={e => setPage(e.target.value)}
                            style={{
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #3a3a3a',
                                color: '#e2e8f0',
                            }}
                            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-600 transition-colors"
                        >
                            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ color: '#9ca3af' }} className="text-xs font-semibold uppercase tracking-wider mb-2.5 block">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe what you found or what you'd like to see..."
                            rows={4}
                            style={{
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #3a3a3a',
                                color: '#e2e8f0',
                                resize: 'none',
                            }}
                            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-600 transition-colors placeholder:text-[#4b5563]"
                        />
                    </div>

                    {error && (
                        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 pt-0 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        style={{ color: '#6b7280', border: '1px solid #333' }}
                        className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{ backgroundColor: '#034638', color: '#fff' }}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {loading ? 'Submitting…' : 'Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Feedback() {
    const [currentUserId, setCurrentUserId] = useState(null);
    const [activeTab,     setActiveTab]     = useState('submitted');
    const [tickets,       setTickets]       = useState([]);
    const [loading,       setLoading]       = useState(true);
    const [showModal,     setShowModal]     = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);
    const [tabHovered,    setTabHovered]    = useState(null);

    // Get session
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data?.user?.id ?? null);
        });
    }, []);

    // Fetch tickets for active tab
    const fetchTickets = useCallback(async () => {
        setLoading(true);

        // 1. Fetch all tickets for this status
        const { data: ticketRows, error: ticketErr } = await supabase
            .from('feedback_tickets')
            .select('*')
            .eq('status', activeTab)
            .order('created_at', { ascending: false });

        if (ticketErr || !ticketRows) { setLoading(false); return; }

        // 2. Fetch vote counts for each ticket
        const ticketIds = ticketRows.map(t => t.id);

        let voteCounts = {};
        let userVotedSet = new Set();

        if (ticketIds.length > 0) {
            const { data: voteRows } = await supabase
                .from('feedback_votes')
                .select('ticket_id, user_id')
                .in('ticket_id', ticketIds);

            if (voteRows) {
                voteRows.forEach(v => {
                    voteCounts[v.ticket_id] = (voteCounts[v.ticket_id] || 0) + 1;
                    if (v.user_id === currentUserId) userVotedSet.add(v.ticket_id);
                });
            }
        }

        const enriched = ticketRows.map(t => ({
            ...t,
            vote_count:     voteCounts[t.id] ?? 0,
            user_has_voted: userVotedSet.has(t.id),
        }));

        // Sort by vote count desc, then by date
        enriched.sort((a, b) => b.vote_count - a.vote_count || new Date(b.created_at) - new Date(a.created_at));

        setTickets(enriched);
        setLoading(false);
    }, [activeTab, currentUserId]);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    const handleVote = async (ticketId, alreadyVoted) => {
        if (!currentUserId) return;

        // Optimistic update
        setTickets(prev => prev.map(t => {
            if (t.id !== ticketId) return t;
            return {
                ...t,
                vote_count:     t.vote_count + (alreadyVoted ? -1 : 1),
                user_has_voted: !alreadyVoted,
            };
        }));

        if (alreadyVoted) {
            await supabase
                .from('feedback_votes')
                .delete()
                .eq('ticket_id', ticketId)
                .eq('user_id', currentUserId);
        } else {
            await supabase
                .from('feedback_votes')
                .insert({ ticket_id: ticketId, user_id: currentUserId });
        }
    };

    const handleDelete = async (ticketId) => {
        // Optimistic removal
        setTickets(prev => prev.filter(t => t.id !== ticketId));
        await supabase.from('feedback_tickets').delete().eq('id', ticketId);
    };

    const handleEdit = (ticket) => {
        setEditingTicket(ticket);
    };

    const tabCounts = { submitted: 0, in_progress: 0, complete: 0 };
    tickets.forEach(t => { if (tabCounts[t.status] !== undefined) tabCounts[t.status]++; });

    return (
        <div
            className="min-h-screen w-full flex flex-col"
            style={{ backgroundColor: theme.sidebar.backgroundColor }}
        >
            {/* ── Page Header ── */}
            <div
                className="px-8 pt-10 pb-6 border-b"
                style={{ borderColor: theme.sidebar.borderColor }}
            >
                <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">Feedback Board</h1>
                        <p style={{ color: '#6b7280' }} className="text-sm">
                            Submit feedback, vote on ideas, and track what's being worked on.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        style={{ backgroundColor: '#034638' }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity shrink-0 shadow-lg"
                    >
                        <Plus size={16} />
                        Submit Feedback
                    </button>
                </div>

                {/* Status Tabs */}
                <div className="max-w-5xl mx-auto mt-6 flex items-center gap-1">
                    {STATUS_TABS.map(({ value, label, icon: Icon }) => {
                        const isActive  = activeTab === value;
                        const isHovered = tabHovered === value;
                        return (
                            <button
                                key={value}
                                id={`feedback-tab-${value}`}
                                onClick={() => setActiveTab(value)}
                                onMouseEnter={() => setTabHovered(value)}
                                onMouseLeave={() => setTabHovered(null)}
                                style={{
                                    backgroundColor: isActive
                                        ? 'rgba(255,255,255,0.08)'
                                        : isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                                    color: isActive ? '#f1f5f9' : '#6b7280',
                                    border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
                            >
                                <Icon size={13} />
                                {label}
                                {value === 'submitted' && (
                                    <span
                                        style={{
                                            backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                                            color: isActive ? '#e2e8f0' : '#6b7280',
                                        }}
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                                    >
                                        {tickets.length}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Ticket Grid ── */}
            <div className="flex-1 px-8 py-8">
                <div className="max-w-5xl mx-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={28} className="animate-spin" style={{ color: '#4b5563' }} />
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div
                                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                            >
                                {activeTab === 'submitted'   && <Send size={22} style={{ color: '#4b5563' }} />}
                                {activeTab === 'in_progress' && <Clock size={22} style={{ color: '#4b5563' }} />}
                                {activeTab === 'complete'    && <CheckCircle2 size={22} style={{ color: '#4b5563' }} />}
                            </div>
                            <p style={{ color: '#6b7280' }} className="text-sm font-medium mb-1">
                                {activeTab === 'submitted'   && 'No feedback submitted yet.'}
                                {activeTab === 'in_progress' && 'Nothing in progress yet.'}
                                {activeTab === 'complete'    && 'No completed items yet.'}
                            </p>
                            {activeTab === 'submitted' && (
                                <button
                                    onClick={() => setShowModal(true)}
                                    style={{ color: '#034638' }}
                                    className="text-sm underline underline-offset-2 mt-1 hover:opacity-80 transition-opacity"
                                >
                                    Be the first to submit feedback
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {tickets.map(ticket => (
                                <TicketCard
                                    key={ticket.id}
                                    ticket={ticket}
                                    currentUserId={currentUserId}
                                    onVote={handleVote}
                                    onDelete={handleDelete}
                                    onEdit={handleEdit}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Submit Modal ── */}
            {showModal && (
                <SubmitModal
                    currentUserId={currentUserId}
                    onClose={() => setShowModal(false)}
                    onSuccess={fetchTickets}
                />
            )}

            {/* ── Edit Modal ── */}
            {editingTicket && (
                <EditModal
                    ticket={editingTicket}
                    onClose={() => setEditingTicket(null)}
                    onSuccess={fetchTickets}
                />
            )}
        </div>
    );
}
