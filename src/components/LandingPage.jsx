import React from 'react';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
            <div className="text-center">
                <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-6 animate-fade-in-down">
                    FinSight V2.0
                </h1>
                <h2 className="text-2xl md:text-4xl font-light text-gray-300 mb-8">
                    Financial Clarity
                </h2>
                <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
                    Experience the future of financial tracking with real-time insights and AI-powered analysis.
                </p>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg">
                    Get Started
                </button>
            </div>
        </div>
    );
};

export default LandingPage;
