import React, { useState } from 'react';
import { LayoutDashboard, LogOut, FileText } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { SummaryCards } from './components/SummaryCards';
import { Charts } from './components/Charts';
import { TransactionTable } from './components/TransactionTable';
import { CategoryInsights } from './pages/CategoryInsights';
import { IncomeInsights } from './pages/IncomeInsights';
import type { Transaction } from './types';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';

function AppContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const location = useLocation();

  const handleDataLoaded = (data: Transaction[]) => {
    setTransactions(data);
  };

  const handleReset = () => {
    setTransactions([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="bg-emerald-100 p-2 rounded-lg">
                <LayoutDashboard className="w-5 h-5 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                Grow <span className="text-emerald-600">money</span>
              </h1>
            </Link>

            {transactions.length > 0 && (
              <nav className="flex items-center gap-1">
                <Link
                  to="/"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/category-insights"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/category-insights'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Category Insights
                </Link>
                <Link
                  to="/income-insights"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/income-insights'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Income Insights
                </Link>
              </nav>
            )}
          </div>

          {transactions.length > 0 && (
            <button
              onClick={handleReset}
              className="text-sm font-medium text-gray-500 hover:text-red-500 flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Reset Data
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {transactions.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center mb-8 max-w-lg">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Welcome to your financial dashboard
              </h2>
              <p className="text-gray-500 text-lg">
                Upload your bank statement to visualize your expenses and track your growth.
              </p>
            </div>
            <FileUploader onDataLoaded={handleDataLoaded} />

            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl text-center">
              <FeatureItem icon={<FileText className="w-5 h-5 text-blue-500" />} text="Excel & CSV Support" />
              <FeatureItem icon={<LayoutDashboard className="w-5 h-5 text-emerald-500" />} text="Instant Analytics" />
              <FeatureItem icon={<LogOut className="w-5 h-5 text-purple-500" />} text="Secure & Private" />
            </div>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                <SummaryCards transactions={transactions} />
                <Charts transactions={transactions} />
                <TransactionTable transactions={transactions} />
              </div>
            } />
            <Route path="/category-insights" element={<CategoryInsights transactions={transactions} />} />
            <Route path="/income-insights" element={<IncomeInsights transactions={transactions} />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

const FeatureItem = ({ icon, text }: { icon: React.ReactNode, text: string }) => (
  <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
    <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
    <span className="font-medium text-gray-700">{text}</span>
  </div>
)

export default App;
