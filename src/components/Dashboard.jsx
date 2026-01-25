import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/auth');
            } else {
                setUser(session.user);
            }
        };

        getSession();
    }, [navigate]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    if (!user) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
                <h1 className="text-3xl font-bold text-slate-900 mb-4">Dashboard</h1>
                <p className="text-slate-600 text-lg mb-8">
                    You are now logged in as <span className="font-semibold text-slate-900">{user.email}</span>
                </p>

                <button
                    onClick={handleLogout}
                    className="bg-red-50 text-red-600 hover:bg-red-100 px-6 py-2.5 rounded-full font-medium transition-colors border border-red-100"
                >
                    Log Out
                </button>
            </div>
        </div>
    );
}
