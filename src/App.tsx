import React, { useState, useEffect } from 'react';
import { LayoutDashboard, LogOut, PieChart, TrendingUp, ShieldCheck, Import, Eye, EyeOff, Wallet, Heart, LineChart } from 'lucide-react';
import { parseFile } from './lib/parser';
import { db } from './lib/db';
import { FileUploader } from './components/FileUploader';
import { SummaryCards } from './components/SummaryCards';
import { Charts } from './components/Charts';
import { TransactionTable } from './components/TransactionTable';
import { BottomNav } from './components/BottomNav';
import { CategoryInsights } from './pages/CategoryInsights';
import { IncomeInsights } from './pages/IncomeInsights';
import { TrendsPage } from './pages/TrendsPage';
import { AccountsPage } from './pages/AccountsPage';
import { WishlistPage } from './pages/WishlistPage';
import { AIExportPage } from './pages/AIExportPage';
import { PrivacyProvider, usePrivacy } from './contexts/PrivacyContext';
import type { Transaction } from './types';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';

function AppContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  // Define navigation items for desktop and potentially BottomNav
  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/category-insights', label: 'Expenses', icon: PieChart },
    { path: '/income-insights', label: 'Income', icon: TrendingUp },
    { path: '/trends', label: 'Trends', icon: LineChart },
    { path: '/accounts', label: 'Wallets', icon: Wallet },
    { path: '/wishlist', label: 'Goals', icon: Heart },
    { path: '/ai-export', label: 'AI Sync', icon: Import },
  ];

  useEffect(() => {
    const loadData = async () => {
      try {
        // Try to load from IndexedDB first
        const count = await db.transactions.count();

        if (count > 0) {
          const savedTransactions = await db.transactions.toArray();
          setTransactions(savedTransactions);
        } else {
          // Fallback to default dataset if DB is empty
          const response = await fetch('/default_dataset.xlsx');
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], 'default_dataset.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const data = await parseFile(file);
            setTransactions(data);
            // Optionally save default data to DB? user didn't ask for it, but consistency is good.
            // Let's NOT save default data to DB to avoid "stickiness" of default data if they reset.
            // Actually, if they reset, we clear DB.
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleDataLoaded = async (data: Transaction[]) => {
    setTransactions(data);
    // Save to DB
    await db.transactions.clear();
    await db.transactions.bulkAdd(data);
  };

  const handleReset = async () => {
    setTransactions([]);
    await db.transactions.clear();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-4 md:pb-8 font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 rounded-b-3xl shadow-sm">
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
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${location.pathname === item.path
                      ? (item.path === '/' ? 'bg-gray-100 text-gray-900' : 'bg-emerald-50 text-emerald-700')
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {transactions.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={togglePrivacyMode}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={isPrivacyMode ? "Show sensitive data" : "Hide sensitive data"}
              >
                {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-2">
                <label className="flex md:hidden cursor-pointer text-emerald-600 hover:text-emerald-700 items-center justify-center p-2 rounded-full hover:bg-emerald-50 transition-colors">
                  <Import className="w-6 h-6" />
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setIsLoading(true);
                          const data = await parseFile(file);
                          await handleDataLoaded(data);
                        } catch (error) {
                          console.error("Upload failed", error);
                        } finally {
                          setIsLoading(false);
                        }
                      }
                    }}
                  />
                </label>

              </div>

              <button
                onClick={handleReset}
                className="hidden md:flex text-sm font-medium text-gray-400 hover:text-red-500 items-center gap-2 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
              >
                <LogOut className="w-4 h-4" />
                Reset
              </button>
            </div>
          )}
        </div>
      </header >

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <Route path="/ai-export" element={<AIExportPage transactions={transactions} />} />
            </Routes>
          )
        }
      </main >
      {transactions.length > 0 && <BottomNav onReset={handleReset} />}
    </div >
  );
}

function App() {
  return (
    <BrowserRouter>
      <PrivacyProvider>
        <AppContent />
      </PrivacyProvider>
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
