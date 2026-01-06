import React, { useState, useEffect } from 'react';
import { LayoutDashboard, LogOut, PieChart, TrendingUp, ShieldCheck } from 'lucide-react';
import { parseFile } from './lib/parser';
import { FileUploader } from './components/FileUploader';
import { SummaryCards } from './components/SummaryCards';
import { Charts } from './components/Charts';
import { TransactionTable } from './components/TransactionTable';
import { CategoryInsights } from './pages/CategoryInsights';
import { IncomeInsights } from './pages/IncomeInsights';
import { TrendsPage } from './pages/TrendsPage';
import { AccountsPage } from './pages/AccountsPage';
import { WishlistPage } from './pages/WishlistPage';
import type { Transaction } from './types';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';

function AppContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const location = useLocation();

  useEffect(() => {
    const loadDefaultData = async () => {
      try {
        const response = await fetch('/default_dataset.xlsx');
        if (!response.ok) {
          console.log('No default dataset found');
          return;
        }

        const blob = await response.blob();
        const file = new File([blob], 'default_dataset.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const data = await parseFile(file);
        setTransactions(data);
      } catch (error) {
        console.error('Error loading default data:', error);
      }
    };

    loadDefaultData();
  }, []);

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
                <Link
                  to="/trends"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/trends'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Financial Trends
                </Link>
                <Link
                  to="/accounts"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/accounts'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Accounts
                </Link>
                <Link
                  to="/wishlist"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/wishlist'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  Wishlist
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
      </header >

      {/* Main Content */}
      < main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" >
        {
          transactions.length === 0 ? (
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

              <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl px-4">
                <FeatureItem
                  icon={<LayoutDashboard className="w-6 h-6" />}
                  title="Smart Overview"
                  description="Get an instant snapshot of your net balance and recent financial activity."
                />
                <FeatureItem
                  icon={<PieChart className="w-6 h-6" />}
                  title="Category Insights"
                  description="Deep dive into your spending habits with detailed category breakdowns."
                />
                <FeatureItem
                  icon={<TrendingUp className="w-6 h-6" />}
                  title="Financial Trends"
                  description="Track your spending history and spot anomalies over time."
                />
                <FeatureItem
                  icon={<ShieldCheck className="w-6 h-6" />}
                  title="Privacy First"
                  description="Your data is processed locally in your browser and never uploaded to any server."
                />
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
              <Route path="/trends" element={<TrendsPage transactions={transactions} />} />
              <Route path="/wishlist" element={<WishlistPage transactions={transactions} />} />
              <Route path="/accounts" element={<AccountsPage transactions={transactions} />} />
            </Routes>
          )
        }
      </main >
    </div >
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

const FeatureItem = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex flex-col items-center text-center gap-4 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 ring-1 ring-emerald-100">{icon}</div>
    <div className="space-y-2">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  </div>
)

export default App;
