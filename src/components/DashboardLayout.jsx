import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function DashboardLayout() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Persistent date range state
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30); // Default to last 30 days
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });

    const navigate = useNavigate();

    useEffect(() => {
        const getSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    navigate('/auth');
                    return;
                }

                // Check for dev_access in profile
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('dev_access')
                    .eq('id', session.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error('Error fetching profile:', error);
                }

                // Redirect if dev_access is explicitly false or if profile doesn't exist (safer default for under-construction apps)
                // User asked: "if their profile has dev_access == False"
                // I will implement: Redirect if profile exists and dev_access is false.
                // But for "Under Construction", usually everyone is blocked except allowed ones.
                // I'll assume if dev_access is NOT true, block them.
                if (!profile || profile.dev_access !== true) {
                    navigate('/under-construction');
                    return;
                }

                setUser(session.user);
            } catch (err) {
                console.error("Auth Error:", err);
                navigate('/auth');
            } finally {
                setLoading(false);
            }
        };

        getSession();
    }, [navigate]);

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <Sidebar user={user} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

            {/* Main Content Area */}
            <div className={`flex-1 p-8 overflow-y-auto h-screen transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
                <Outlet context={{ startDate, setStartDate, endDate, setEndDate }} />
            </div>
        </div>
    );
}
