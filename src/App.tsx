import { useState, useEffect } from 'react';
import { LayoutDashboard, PieChart, TrendingUp, ShieldCheck, Import, Eye, EyeOff, Wallet, Heart, LineChart, ChevronDown } from 'lucide-react';
import * as Icons from 'lucide-react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { PrivacyProvider, usePrivacy } from './contexts/PrivacyContext';
import { useUserSettings, UserSettingsProvider } from './contexts/UserSettingsContext';

import { getFormattedDateRange, cn } from './lib/utils';
import { db } from './lib/db';
import { FileUploader } from './components/FileUploader';
import { syncAccountsWithSupabase } from './lib/accountUtils';
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
import { SettingsPage } from './pages/SettingsPage';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import type { Transaction } from './types';


// Feature Data
const FEATURES = [
  {
    icon: <LayoutDashboard className="w-5 h-5" />,
    title: "Smart Overview",
    description: "Get an instant snapshot of your net balance and recent financial activity at a glance.",
    color: "bg-emerald-50 text-emerald-600"
  },
  {
    icon: <PieChart className="w-5 h-5" />,
    title: "Category Insights",
    description: "Deep dive into your spending habits with detailed category and tag breakdowns.",
    color: "bg-blue-50 text-blue-600"
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Income Analysis",
    description: "Track your revenue sources and monitor your monthly earnings growth.",
    color: "bg-purple-50 text-purple-600"
  },
  {
    icon: <LineChart className="w-5 h-5" />,
    title: "Financial Trends",
    description: "Analyze historical performance over 3M, 6M, 1Y or All Time periods.",
    color: "bg-amber-50 text-amber-600"
  },
  {
    icon: <Wallet className="w-5 h-5" />,
    title: "Multi-Wallet",
    description: "Manage multiple accounts and track your total net worth in one place.",
    color: "bg-indigo-50 text-indigo-600"
  },
  {
    icon: <Heart className="w-5 h-5" />,
    title: "Goal Planning",
    description: "Set financial goals, track wishlists, and monitor your savings progress.",
    color: "bg-rose-50 text-rose-600"
  },
  {
    icon: <Import className="w-5 h-5" />,
    title: "AI Integration",
    description: "Export clean data efficiently for advanced analysis with ChatGPT or Gemini.",
    color: "bg-sky-50 text-sky-600"
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: "Privacy First",
    description: "100% local processing. Your financial data is never uploaded to any server.",
    color: "bg-gray-50 text-gray-600"
  }
];



// ... existing code ...

function AppContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null); // Add session state
  const location = useLocation();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [showAuth, setShowAuth] = useState(false);
  const { settings } = useUserSettings();


  // Define navigation items for desktop and potentially BottomNav
  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/category-insights', label: 'Expenses', icon: PieChart },
    { path: '/income-insights', label: 'Income', icon: TrendingUp },
    { path: '/trends', label: 'Trends', icon: LineChart },
    { path: '/accounts', label: 'Wallets', icon: Wallet },
    { path: '/wishlist', label: 'Goals', icon: Heart },
    { path: '/ai-export', label: 'AI', icon: Import },
  ];

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUserEmail(session?.user?.email);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserEmail(session?.user?.email);
    });

    // Load Data
    const loadData = async () => {
      // Only auto-load data from DB if we have a session
      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        const count = await db.transactions.count();
        if (count > 0) {
          const savedTransactions = await db.transactions.toArray();
          // UI PREFERENCE: Sort Newest First (Desc)
          savedTransactions.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (a.index || 0) - (b.index || 0);
          });
          setTransactions(savedTransactions);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    return () => subscription.unsubscribe();
  }, []);

  const handleDataLoaded = async (data: Transaction[]) => {
    // UI PREFERENCE: Sort Newest First (Desc)
    data.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.index || 0) - (b.index || 0);
    });

    setTransactions(data);
    await db.transactions.clear();
    await db.transactions.bulkAdd(data);

    // Sync newly discovered accounts to Supabase
    if (session?.user?.id) {
      // Import dynamically or ensure imported at top. 
      // Since it's a small app, top-level import is fine.
      // But wait, I need to look at imports first.
      syncAccountsWithSupabase(data, session.user.id);
    }
  };

  const handleReset = async () => {
    setTransactions([]);
    await db.transactions.clear();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Optional: Clear local data on logout? 
    // await handleReset(); 
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // If not authenticated and explicitly asked for auth, show Auth screen
  if (!session && showAuth) {
    return <Auth onLogin={() => setShowAuth(false)} />;
  }


  return (
    <div className={`min-h-screen pb-4 md:pb-8 font-sans selection:bg-emerald-200 selection:text-emerald-900 overflow-x-hidden relative transition-colors duration-700 ${transactions.length > 0 ? 'bg-slate-50' : 'bg-[#F0FDF9]'}`}>
      {/* --- Ethereal Background Layers (Only on Landing) --- */}

      {transactions.length === 0 && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Top Right Blob - Ghostly */}
          <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-gradient-to-br from-emerald-50/20 to-cyan-50/20 rounded-full blur-[160px] mix-blend-multiply opacity-30 animate-blob transition-all duration-1000" />

          {/* Bottom Left Blob - Ghostly */}
          <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tr from-teal-50/20 to-emerald-50/10 rounded-full blur-[160px] mix-blend-multiply opacity-30 animate-blob animation-delay-4000 transition-all duration-1000" />

          {/* Center - Almost invisible shimmer */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-white/40 rounded-full blur-[180px] opacity-20 animate-pulse-slow" />
        </div>
      )}

      {/* Header */}
      <header className={`${transactions.length > 0 ? 'bg-white/80' : 'bg-transparent'} backdrop-blur-md border-b ${transactions.length > 0 ? 'border-gray-200/50' : 'border-transparent'} fixed top-0 inset-x-0 z-50 rounded-b-3xl transition-all duration-500 h-16`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex-none flex items-center">
            <Link to="/" className="flex items-center gap-2 group cursor-pointer" onClick={handleReset}>
              {/* Note: Added onClick reset for logo to go back to home/reset if needed, or just standard link */}
              <div className="bg-white/40 border border-white/60 p-2 rounded-xl backdrop-blur-md shadow-sm group-hover:bg-white/60 transition-colors">
                <LayoutDashboard className="w-5 h-5 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-emerald-950">
                Grow <span className="text-emerald-600">money</span>
              </h1>
            </Link>
          </div>

          {transactions.length > 0 && (
            <div className="hidden md:flex flex-1 items-center justify-center gap-4">
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${location.pathname === item.path
                      ? (item.path === '/' ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-50 text-emerald-700')
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Test Mode Indicator - Positioned after menu */}
              {!session && (
                <div className="px-3 py-1 bg-amber-100 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2 shadow-sm whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Test Mode
                </div>
              )}
            </div>
          )}

          <div className="flex-none flex items-center gap-2">

            {transactions.length > 0 && (
              <button
                onClick={togglePrivacyMode}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={isPrivacyMode ? "Show sensitive data" : "Hide sensitive data"}
              >
                {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            )}

            {/* Auth / User Menu */}
            {!session ? (
              <button
                onClick={() => setShowAuth(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
              >
                Sign In
              </button>
            ) : (
              transactions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 overflow-hidden">
                      {settings.profile.avatar_icon ? (
                        <DynamicUserIcon name={settings.profile.avatar_icon} className="w-5 h-5" />
                      ) : (
                        userEmail ? userEmail[0].toUpperCase() : <Wallet className="w-4 h-4" />
                      )}
                    </div>
                    <span className="hidden md:block max-w-[100px] truncate">
                      {settings.profile.full_name || userEmail?.split('@')[0]}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>

                  {isUserMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                        <Link
                          to="/settings"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Settings
                        </Link>
                        <button
                          onClick={() => {
                            handleReset();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          Clear Data
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button
                          onClick={() => {
                            handleLogout();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </header >

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8 relative">
        {
          transactions.length === 0 ? (
            <div className="min-h-[85vh] flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-1000 relative">

              {/* --- Floating Glass Icons --- */}

              {/* Top Left: Bar Chart */}
              <div className="absolute top-[15%] left-[10%] w-20 h-20 rounded-2xl bg-white/30 border border-white/60 backdrop-blur-xl shadow-lg flex items-center justify-center animate-float hidden lg:flex">
                <div className="bg-emerald-100/50 p-3 rounded-xl">
                  <LineChart className="w-8 h-8 text-emerald-600" />
                </div>
              </div>

              {/* Top Right: Pie Chart */}
              <div className="absolute top-[20%] right-[15%] w-16 h-16 rounded-2xl bg-white/30 border border-white/60 backdrop-blur-xl shadow-lg flex items-center justify-center animate-float animation-delay-2000 hidden lg:flex">
                <div className="bg-cyan-100/50 p-3 rounded-xl">
                  <PieChart className="w-6 h-6 text-cyan-600" />
                </div>
              </div>

              {/* Bottom Left: Coins */}
              <div className="absolute bottom-[25%] left-[15%] w-14 h-14 rounded-full bg-white/30 border border-white/60 backdrop-blur-xl shadow-lg flex items-center justify-center animate-float animation-delay-4000 hidden lg:flex">
                <div className="bg-emerald-50 p-2.5 rounded-full">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>

              {/* Bottom Right: Wallet */}
              <div className="absolute bottom-[30%] right-[10%] w-18 h-18 rounded-2xl bg-white/30 border border-white/60 backdrop-blur-xl shadow-lg flex items-center justify-center animate-float animation-delay-1000 hidden lg:flex">
                <div className="bg-teal-100/50 p-3 rounded-xl">
                  <Wallet className="w-7 h-7 text-teal-600" />
                </div>
              </div>


              {/* Hero Section */}
              <div className="text-center mb-8 md:mb-16 max-w-4xl relative z-10">
                <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight text-emerald-950 mb-6 leading-tight">
                  Your Personal <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                    Financial Analytics
                  </span>
                </h2>
                <p className="text-emerald-800/60 text-lg md:text-xl font-medium tracking-wide max-w-2xl mx-auto leading-relaxed">
                  Transform your raw bank statements into actionable insights. <br className="hidden md:block" />
                  Secure, private, and beautifully visualized.
                </p>
              </div>

              <FileUploader onDataLoaded={handleDataLoaded} isAuthenticated={!!session} onSignIn={() => setShowAuth(true)} />

              {/* Comprehensive Features Grid */}
              <div className="mt-32 w-full">
                <div className="text-center mb-12">
                  <h3 className="text-sm font-bold text-emerald-600/50 uppercase tracking-[0.2em]">Everything you need</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full px-4">
                  {FEATURES.map((feature, idx) => (
                    <FeatureItem key={idx} {...feature} darkMode={false} glassMode={true} />
                  ))}
                </div>
              </div>

              {/* Footer text */}
              <div className="mt-20 text-center text-sm text-emerald-800/40 font-medium tracking-widest uppercase">
                <p>© 2026 Grow Money</p>
              </div>
            </div>
          ) : (
            // Logged in Dashboard View - Clean layout
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Routes>
                {/* ... existing routes ... */}
                <Route path="/" element={
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                    {/* Dashboard Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                        <p className="text-gray-500">Overview of your current financial health</p>
                      </div>
                      {transactions.length > 0 && (
                        <div className="px-3 py-1 bg-white/50 border border-emerald-100 rounded-lg text-xs md:text-sm font-medium text-emerald-700 flex items-center gap-2 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          {getFormattedDateRange(transactions)}
                        </div>
                      )}
                    </div>

                    <SummaryCards transactions={transactions} />
                    <Charts transactions={transactions} />
                    <TransactionTable transactions={transactions} />
                  </div>
                } />
                <Route path="/category-insights" element={<CategoryInsights transactions={transactions} />} />
                <Route path="/income-insights" element={<IncomeInsights transactions={transactions} />} />
                <Route path="/trends" element={<TrendsPage transactions={transactions} />} />
                <Route path="/wishlist" element={<WishlistPage transactions={transactions} />} />
                <Route path="/accounts" element={<AccountsPage transactions={transactions} userId={session?.user?.id} />} />
                <Route path="/ai-export" element={<AIExportPage transactions={transactions} />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          )
        }
      </main >
      {transactions.length > 0 && <BottomNav onReset={handleReset} />}
    </div >
  );
}

const DynamicUserIcon = ({ name, className }: { name: string, className?: string }) => {
  const IconComponent = (Icons as any)[name] || Icons.User;
  return <IconComponent className={className} />;
};

function App() {
  return (
    <BrowserRouter>
      <PrivacyProvider>
        <UserSettingsProvider>
          <AppContent />
        </UserSettingsProvider>
      </PrivacyProvider>
    </BrowserRouter>
  );
}

const FeatureItem = ({ icon, title, description, color, darkMode, glassMode }: { icon: React.ReactNode, title: string, description: string, color: string, darkMode?: boolean, glassMode?: boolean }) => (
  <div className={cn(
    "group flex flex-col gap-4 p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1 relative overflow-hidden",
    glassMode
      ? "bg-white/40 border-white/60 shadow-sm hover:shadow-lg hover:bg-white/60 backdrop-blur-lg"
      : darkMode
        ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(52,211,153,0.1)]"
        : "bg-white border-gray-100 shadow-sm hover:shadow-lg"
  )}>
    <div className={cn(
      "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300",
      glassMode ? "bg-white/50 text-emerald-600 shadow-inner" : (darkMode ? "bg-white/10 text-emerald-400" : color)
    )}>
      {icon}
    </div>
    <div className="space-y-2 relative z-10">
      <h3 className={cn("font-bold text-lg", darkMode ? "text-white" : "text-emerald-950")}>{title}</h3>
      <p className={cn("text-sm leading-relaxed", darkMode ? "text-slate-400" : "text-emerald-800/60")}>{description}</p>
    </div>

    {darkMode && (
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    )}
  </div>
)

export default App;
