import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Auth() {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [isSignUp, setIsSignUp] = useState(searchParams.get('signup') === 'true');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            first_name: firstName.trim(),
                            last_name: lastName.trim(),
                        },
                    },
                });
                if (error) throw error;

                setMessage('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                navigate('/dashboard');
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/dashboard',
            },
        });
        if (error) {
            setMessage(error.message);
        }
    };

    return (
        <div className="min-h-screen bg-white flex font-sans">
            {/* Left Panel — Auth Form */}
            <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-between p-8 sm:p-12 lg:p-16 shrink-0">
                {/* Top: Logo */}
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-md">
                        F
                    </div>
                    <span className="font-bold text-xl tracking-tight text-slate-900">FinSight</span>
                </div>

                {/* Center: Form */}
                <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto lg:mx-0 mt-12 lg:mt-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
                        {isSignUp ? 'Get started with' : 'Continue to'}
                        <br />
                        <span className="text-slate-900">FinSight.</span>
                    </h1>
                    <p className="text-slate-500 mt-3 text-base">
                        {isSignUp
                            ? 'Create your account to start tracking.'
                            : 'Your personal finance tracker, powered by AI.'
                        }
                    </p>

                    {/* Google Button */}
                    <button
                        onClick={handleGoogleLogin}
                        className="mt-8 w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 text-slate-700 font-semibold text-sm shadow-sm hover:shadow-md"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px bg-slate-200"></div>
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleAuth} className="space-y-4">
                        {isSignUp && (
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder="First name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white outline-none transition-all text-sm placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder="Last name"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white outline-none transition-all text-sm placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                        )}

                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white outline-none transition-all text-sm placeholder:text-slate-400"
                        />

                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white outline-none transition-all text-sm placeholder:text-slate-400"
                        />

                        {message && (
                            <div className={`p-3 rounded-xl text-sm font-medium ${message.includes('Check') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Continue')}
                        </button>
                    </form>

                    {/* Toggle */}
                    <p className="mt-6 text-center text-sm text-slate-500">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setMessage('');
                                setFirstName('');
                                setLastName('');
                            }}
                            className="font-semibold text-slate-900 hover:underline underline-offset-2"
                        >
                            {isSignUp ? 'Log In' : 'Sign Up'}
                        </button>
                    </p>
                </div>

                {/* Bottom Spacer — balances layout */}
                <div />
            </div>

            {/* Right Panel — Dashboard Preview */}
            <div className="hidden lg:flex flex-1 bg-slate-50 items-center justify-center p-12 xl:p-16 relative overflow-hidden">
                {/* Background decorative gradients */}
                <div className="absolute -top-[20%] -right-[10%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute -bottom-[20%] -left-[10%] w-[400px] h-[400px] bg-emerald-200/30 rounded-full blur-[100px] pointer-events-none" />

                {/* Browser Mockup */}
                <div className="relative z-10 w-full max-w-2xl">
                    {/* Browser Chrome */}
                    <div className="bg-white rounded-t-2xl border border-slate-200 border-b-0 px-4 py-3 flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                        </div>
                        <div className="flex-1 flex justify-center">
                            <div className="bg-slate-100 rounded-lg px-4 py-1.5 text-xs text-slate-400 font-medium w-64 text-center">
                                finsight.app/dashboard
                            </div>
                        </div>
                        <div className="w-[54px]" /> {/* Spacer to center address bar */}
                    </div>

                    {/* Screenshot */}
                    <div className="bg-white rounded-b-2xl border border-slate-200 border-t shadow-2xl shadow-slate-900/10 overflow-hidden">
                        <img
                            src="/dashboard-preview.png"
                            alt="FinSight Dashboard Preview"
                            className="w-full h-auto block"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
