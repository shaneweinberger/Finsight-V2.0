import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import constructionCrane from '../assets/construction_crane.png';

export default function UnderConstruction() {
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-slate-100 text-center">

                {/* Image Section */}
                <div className="mb-6 flex justify-center">
                    <div className="relative w-64 h-64">
                        <img
                            src={constructionCrane}
                            alt="Under Construction Crane"
                            className="w-full h-full object-contain animate-bounce-slow"
                        />
                    </div>
                </div>

                <h2 className="text-3xl font-bold text-slate-900 mb-4">
                    Under Development
                </h2>

                <p className="text-slate-600 mb-8 text-lg leading-relaxed">
                    Sorry, but Finsight is currently under development. <br />
                    Thank you for your interest. <br />
                    We will reach out once we are live!
                </p>

                <button
                    onClick={handleLogout}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                    </svg>
                    Log Out & Return Home
                </button>
            </div>
            <style>{`
                @keyframes bounce-slow {
                    0%, 100% { transform: translateY(-5%); }
                    50% { transform: translateY(5%); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 3s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
}
