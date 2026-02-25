import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PieChart, Upload, Tags, Zap, LogOut, ChevronUp, ChevronDown, User, Settings, AlertTriangle, PanelLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { theme } from '../theme';
import peanutLove from '../assets/peanut_love.jpg';
import SettingsModal from './dashboard/SettingsModal';

// Helper component for hover state
function SidebarLink({ item, isCollapsed }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <NavLink
            to={item.path}
            end={item.end}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={({ isActive }) => ({
                backgroundColor: isActive ? theme.sidebar.activeItemBackground : (isHovered ? theme.sidebar.hoverItemBackground : undefined),
                color: isActive ? theme.sidebar.activeItemText : (isHovered ? theme.sidebar.hoverItemText : theme.sidebar.inactiveItemText),
            })}
            className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                    ? 'shadow-md mx-2'
                    : 'mx-0'
                } ${isCollapsed ? 'justify-center mx-0 px-0 w-10 h-10 ml-1' : ''}`
            }
        >
            {item.icon}
            {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
        </NavLink>
    );
}

// Helper component for dropdown items
function DropdownItem({ icon, label, onClick, className }) {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${className}`}
            style={{
                backgroundColor: isHovered ? theme.sidebar.dropdownHoverBackground : 'transparent',
                color: className?.includes('text-red') ? (isHovered ? '#fca5a5' : '#f87171') : (isHovered ? '#ffffff' : '#cbd5e1')
            }}
        >
            {icon}
            {label}
        </button>
    );
}

export default function Sidebar({ user, isCollapsed, setIsCollapsed }) {
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isProfileHovered, setIsProfileHovered] = useState(false);
    const [isToggleHovered, setIsToggleHovered] = useState(false);
    const [showSecretModal, setShowSecretModal] = useState(false);
    const [logoClickCount, setLogoClickCount] = useState(0);
    const navigate = useNavigate();

    // Reset click count if no clicks for 2 seconds
    React.useEffect(() => {
        let timer;
        if (logoClickCount > 0) {
            timer = setTimeout(() => setLogoClickCount(0), 1000);
        }
        return () => clearTimeout(timer);
    }, [logoClickCount]);

    const handleLogoClick = () => {
        if (user?.email === 'emmarlevine@gmail.com') {
            const newCount = logoClickCount + 1;
            setLogoClickCount(newCount);

            if (newCount === 5) {
                setShowSecretModal(true);
                setLogoClickCount(0);
            }
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const navItems = [
        { path: '/dashboard', label: 'Overview', icon: <LayoutDashboard size={20} />, end: true },
        { path: '/dashboard/analysis', label: 'Analysis', icon: <PieChart size={20} /> },
        { path: '/dashboard/uploads', label: 'Transaction Uploads', icon: <Upload size={20} /> },
        { path: '/dashboard/categories', label: 'Categories', icon: <Tags size={20} /> },
        { path: '/dashboard/rules', label: 'Rules', icon: <Zap size={20} /> },
    ];

    return (
        <div
            className={`flex flex-col h-screen fixed left-0 top-0 z-20 transition-all duration-300 border-r ${isCollapsed ? 'w-20' : 'w-64'}`}
            style={{
                backgroundColor: theme.sidebar.backgroundColor,
                borderColor: theme.sidebar.borderColor
            }}
        >
            {/* Logo Area */}
            <div
                className="h-16 flex items-center justify-between px-4 border-b relative"
                style={{ borderColor: theme.sidebar.borderColor }}
            >
                {!isCollapsed && (
                    <div
                        onClick={handleLogoClick}
                        className={`flex items-center gap-2 font-bold text-xl animate-fade-in-up whitespace-nowrap overflow-hidden ${user?.email === 'emmarlevine@gmail.com' ? 'cursor-pointer' : ''}`}
                        style={{ color: theme.sidebar.logoText }}
                    >
                        <div className="w-8 h-8 rounded-lg bg-white text-slate-900 flex items-center justify-center shrink-0">F</div>
                        FinSight
                    </div>
                )}

                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={`transition-colors p-2 rounded-lg ${isCollapsed ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'absolute right-3'}`}
                    onMouseEnter={() => setIsToggleHovered(true)}
                    onMouseLeave={() => setIsToggleHovered(false)}
                    style={{
                        color: theme.sidebar.toggleButtonColor,
                        backgroundColor: isToggleHovered ? theme.sidebar.toggleButtonHoverColor : 'transparent'
                    }}
                >
                    <PanelLeft size={20} />
                </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
                {navItems.map((item) => (
                    <SidebarLink key={item.path} item={item} isCollapsed={isCollapsed} />
                ))}
            </div>

            {/* User Dropdown */}
            <div
                className="p-4 border-t relative"
                style={{ borderColor: theme.sidebar.borderColor }}
            >
                {isUserMenuOpen && !isCollapsed && (
                    <div
                        className="absolute bottom-full left-4 right-4 mb-2 border rounded-xl shadow-xl overflow-hidden animate-fade-in-up"
                        style={{
                            backgroundColor: theme.sidebar.dropdownBackground,
                            borderColor: theme.sidebar.dropdownBorder
                        }}
                    >
                        <div className="p-4 border-b" style={{ borderColor: theme.sidebar.dropdownBorder }}>
                            <p className="font-medium truncate" style={{ color: theme.sidebar.userText }}>{user?.email?.split('@')[0]}</p>
                            <p className="text-xs truncate" style={{ color: theme.sidebar.userSubtext }}>{user?.email}</p>
                        </div>
                        <div className="p-1">
                            <DropdownItem
                                icon={<Settings size={16} />}
                                label="Settings"
                                onClick={() => {
                                    setIsSettingsOpen(true);
                                    setIsUserMenuOpen(false);
                                }}
                            />
                            <DropdownItem icon={<Zap size={16} />} label="Upgrade Plan" />
                            <DropdownItem icon={<AlertTriangle size={16} />} label="Report a Bug" />
                            <DropdownItem
                                icon={<LogOut size={16} />}
                                label="Sign Out"
                                onClick={handleLogout}
                                className="text-red-400"
                            />
                        </div>
                    </div>
                )}

                <button
                    onClick={() => !isCollapsed && setIsUserMenuOpen(!isUserMenuOpen)}
                    onMouseEnter={() => setIsProfileHovered(true)}
                    onMouseLeave={() => setIsProfileHovered(false)}
                    className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors border border-transparent group ${isCollapsed ? 'justify-center' : ''}`}
                    style={{
                        backgroundColor: isProfileHovered ? theme.sidebar.userProfileHoverBackground : 'transparent',
                        borderColor: isProfileHovered ? theme.sidebar.dropdownBorder : 'transparent'
                    }}
                >
                    <div className="w-9 h-9 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-600 group-hover:border-slate-500 shrink-0">
                        {user?.email?.[0].toUpperCase() || 'U'}
                    </div>
                    {!isCollapsed && (
                        <>
                            <div className="flex-1 text-left overflow-hidden">
                                <p className="text-sm font-medium truncate" style={{ color: theme.sidebar.userText }}>
                                    {user?.email?.split('@')[0]}
                                </p>
                            </div>
                            <ChevronUp size={16} className={`transition-transform duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`} style={{ color: theme.sidebar.userSubtext }} />
                        </>
                    )}
                </button>
            </div>

            {/* Secret Modal */}
            {showSecretModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl relative flex flex-col items-center text-center">

                        <button
                            onClick={() => setShowSecretModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                        <div className="mb-6 rounded-xl overflow-hidden shadow-lg">
                            <img src={peanutLove} alt="Peanuts in love" className="w-full h-auto object-cover" />
                        </div>

                        <h3 className="text-2xl font-bold text-gray-800 mb-2 font-serif">
                            To the moon and back, forever. ❤️
                        </h3>
                    </div>
                </div>
            )}
            {/* User Settings Modal */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                user={user}
            />
        </div>
    );
}
