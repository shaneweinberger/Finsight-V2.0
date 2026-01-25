import React, { useState, useEffect } from "react";
import { Check, Star, ArrowRight, Menu, X, Brain, Shield, Zap, LayoutDashboard } from "lucide-react";
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-[10%] left-[20%] w-[500px] h-[500px] bg-blue-200/40 rounded-full blur-[100px] mix-blend-multiply animate-blob" />
                <div className="absolute top-[10%] right-[20%] w-[400px] h-[400px] bg-emerald-200/40 rounded-full blur-[100px] mix-blend-multiply animate-blob animation-delay-2000" />
                <div className="absolute -bottom-[10%] left-[30%] w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[100px] mix-blend-multiply animate-blob animation-delay-4000" />
            </div>

            {/* Navbar */}
            <nav
                className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50 w-[95%] max-w-5xl transition-all duration-300 ${isScrolled
                    ? "bg-white/80 backdrop-blur-md shadow-lg border border-slate-200/50 py-3 rounded-full"
                    : "bg-white/50 backdrop-blur-sm border border-transparent py-4 rounded-full"
                    }`}
            >
                <div className="px-6 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                            <span className="text-lg">F</span>
                        </div>
                        FinSight
                    </div>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                        <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
                        <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it Works</a>
                        <a href="#security" className="hover:text-slate-900 transition-colors">Security</a>
                    </div>

                    {/* Right Area */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={() => navigate('/auth')}
                            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            Log In
                        </button>
                        <button
                            onClick={() => navigate('/auth')}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-0.5"
                        >
                            Get Started
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 text-slate-600"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="absolute top-full left-0 w-full bg-white rounded-2xl shadow-xl mt-2 p-4 flex flex-col gap-4 border border-slate-100 md:hidden">
                        <a href="#features" className="text-slate-600 hover:text-slate-900 font-medium p-2">Features</a>
                        <a href="#how-it-works" className="text-slate-600 hover:text-slate-900 font-medium p-2">How it Works</a>
                        <a href="#security" className="text-slate-600 hover:text-slate-900 font-medium p-2">Security</a>
                        <hr className="border-slate-100" />
                        <button onClick={() => navigate('/auth')} className="w-full text-center py-2 font-medium text-slate-600">Log In</button>
                        <button onClick={() => navigate('/auth')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium">Get Started</button>
                    </div>
                )}
            </nav>

            {/* Hero Section */}
            <div className="relative z-10 pt-48 pb-20 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-8">
                    {/* Headlines */}
                    <div className="space-y-6 animate-fade-in-up delay-100">
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900 leading-[1.1]">
                            Personal Finance Tracking <br className="hidden md:block" />
                            Automated With <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600">Finsight.</span>
                        </h1>
                        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
                            Stop wrestling with messy CSVs. FinSight uses AI to clean, categorize, and analyze your spending automatically.
                        </p>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-fade-in-up delay-200">
                        <button
                            onClick={() => navigate('/auth')}
                            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white text-lg font-medium px-8 py-4 rounded-full transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1"
                        >
                            Start Tracking
                        </button>
                        <button className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-lg font-medium px-8 py-4 rounded-full transition-all duration-300 shadow-sm hover:shadow-md">
                            View Demo
                        </button>
                    </div>
                </div>
            </div>
            <section id="how-it-works" className="relative z-10 py-20 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                            From Raw Data to Real Intelligence
                        </h2>
                        <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                            Our 4-step local pipeline transforms messy CSVs into a pristine financial system.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-4 gap-6 relative">
                        {/* Connector Line (Desktop) */}
                        <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 z-0" />

                        {[
                            {
                                step: "01",
                                title: "Ingest",
                                subtitle: "The Raw Layer",
                                desc: "Upload Credit & Debit CSVs. The system extracts dates and amounts into a 'Silver' dataset.",
                                icon: <LayoutDashboard size={24} className="text-blue-600" />
                            },
                            {
                                step: "02",
                                title: "Refine",
                                subtitle: "The Intelligence Layer",
                                desc: "Create simple rules (e.g. 'Amazon' = 'Shopping'). Override specific transactions manually.",
                                icon: <Brain size={24} className="text-purple-600" />
                            },
                            {
                                step: "03",
                                title: "Process",
                                subtitle: "The Action Layer",
                                desc: "One-click 'Reprocess' runs the pipeline, applying all rules to historical data instantly.",
                                icon: <Zap size={24} className="text-yellow-600" />
                            },
                            {
                                step: "04",
                                title: "Analyze",
                                subtitle: "The Value Layer",
                                desc: "Dashboards and AI Chatbot update instantly with your clean, categorized 'Gold' dataset.",
                                icon: <Check size={24} className="text-emerald-600" />
                            }
                        ].map((item, i) => (
                            <div key={i} className="relative z-10 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 mx-auto border border-slate-100">
                                    {item.icon}
                                </div>
                                <div className="text-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{item.step} - {item.title}</span>
                                    <h3 className="font-bold text-slate-900 mb-2">{item.subtitle}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="relative z-10 py-24 px-4 bg-white/50 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 mb-4">
                            Everything You Need in a Finance Tracker
                        </h2>
                        <p className="text-slate-600 text-lg">Built for power users who want control, speed, and privacy.</p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* AI Core */}
                        <div className="col-span-1 lg:col-span-2 group p-8 rounded-3xl bg-slate-900 text-white shadow-xl overflow-hidden relative">
                            <div className="relative z-10">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 backdrop-blur-sm">
                                    <Brain size={24} className="text-blue-300" />
                                </div>
                                <h3 className="text-2xl font-bold mb-3">AI-Powered Insights</h3>
                                <p className="text-slate-300 leading-relaxed max-w-lg mb-6">
                                    Get instant answers to complex questions like "How much did I spend on Uber in March?" without manually sorting data. Our Agentic system scopes the data and verifies the math.
                                </p>
                                <div className="flex gap-2">
                                    <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-medium border border-white/10">Natural Language</span>
                                    <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-medium border border-white/10">Math Verification</span>
                                </div>
                            </div>
                            <div className="absolute top-1/2 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none" />
                        </div>

                        {/* Smart Transactions */}
                        <div className="group p-8 rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mb-6">
                                <LayoutDashboard size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Unified Dashboard</h3>
                            <p className="text-slate-500 leading-relaxed text-sm">
                                Upload Credit and Debit CSVs separately but view them in a single, unified list. Filter, search, and edit thousands of transactions.
                            </p>
                        </div>

                        {/* Automation */}
                        <div className="group p-8 rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6">
                                <Zap size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Rule Automation</h3>
                            <p className="text-slate-500 leading-relaxed text-sm">
                                Create "If This, Then That" rules. One-click "Reprocess" applies new rules to all historical data instantly.
                            </p>
                        </div>

                        {/* Privacy */}
                        <div className="group p-8 rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
                                <Shield size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Local First Security</h3>
                            <p className="text-slate-500 leading-relaxed text-sm">
                                Your financial data stays local. We process CSVs on your machine, not in a third-party cloud database.
                            </p>
                        </div>

                        {/* Analytics */}
                        <div className="group p-8 rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
                                <LayoutDashboard size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Monthly Analytics</h3>
                            <p className="text-slate-500 leading-relaxed text-sm">
                                Interactive charts to spot trends, spending anomalies, and month-over-month comparisons.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 bg-slate-900 text-slate-300 py-12 px-4 border-t border-slate-800">
                <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
                    <div className="col-span-2">
                        <div className="flex items-center gap-2 font-bold text-white text-xl mb-4">
                            <div className="w-8 h-8 rounded-lg bg-white text-slate-900 flex items-center justify-center">F</div>
                            FinSight
                        </div>
                        <p className="max-w-xs text-sm">The intelligent, privacy-focused personal finance tracker for the modern era.</p>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4">Product</h4>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#features" className="hover:text-white">Features</a></li>
                            <li><a href="#security" className="hover:text-white">Security</a></li>
                            <li><a href="#" className="hover:text-white">Changelog</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4">Company</h4>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#" className="hover:text-white">About</a></li>
                            <li><a href="#" className="hover:text-white">Contact</a></li>
                            <li><a href="#" className="hover:text-white">Twitter</a></li>
                        </ul>
                    </div>
                </div>
            </footer>

            <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
          opacity: 0;
          transform: translateY(20px);
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        
        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </div >
    );
}
