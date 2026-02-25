import React, { useState, useEffect } from 'react';
import { X, User, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function SettingsModal({ isOpen, onClose, user }) {
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: ''
    });

    useEffect(() => {
        if (isOpen && user) {
            fetchProfile();
        }
    }, [isOpen, user]);

    const fetchProfile = async () => {
        setFetching(true);
        setStatus({ type: '', message: '' });
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"

            if (data) {
                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || ''
                });
            }
        } catch (err) {
            console.error('Error fetching profile:', err);
            setStatus({ type: 'error', message: 'Failed to load profile data.' });
        } finally {
            setFetching(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: '', message: '' });

        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    first_name: formData.first_name,
                    last_name: formData.last_name,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            setStatus({ type: 'success', message: 'Profile updated successfully!' });
            setTimeout(() => {
                setStatus({ type: '', message: '' });
            }, 3000);
        } catch (err) {
            console.error('Error saving profile:', err);
            setStatus({ type: 'error', message: `Failed to save: ${err.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Manage your account settings and preferences</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {fetching ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                            <Loader2 size={32} className="animate-spin text-indigo-600" />
                            <p className="text-sm font-medium">Loading your profile...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <User size={16} className="text-indigo-500" />
                                        First Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.first_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                        placeholder="Enter your first name"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <User size={16} className="text-indigo-500" />
                                        Last Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.last_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                        placeholder="Enter your last name"
                                    />
                                </div>
                            </div>

                            {status.message && (
                                <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'
                                    }`}>
                                    {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                    <p className="text-sm font-medium">{status.message}</p>
                                </div>
                            )}

                            <div className="pt-2 flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
