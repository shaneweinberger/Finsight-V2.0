import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Auth from './components/Auth';
import DashboardLayout from './components/DashboardLayout';
import Overview from './components/dashboard/Overview';
import Analysis from './components/dashboard/Analysis';
import TransactionUploads from './components/dashboard/TransactionUploads';
import Categories from './components/dashboard/Categories';
import Rules from './components/dashboard/Rules';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="uploads" element={<TransactionUploads />} />
          <Route path="categories" element={<Categories />} />
          <Route path="rules" element={<Rules />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
