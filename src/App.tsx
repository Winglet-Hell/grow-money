import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, PieChart, TrendingUp, Wallet, LineChart, ShieldCheck, Import, Heart } from 'lucide-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { UserSettingsProvider } from './contexts/UserSettingsContext';

import { cn } from './lib/utils';
import { db } from './lib/db';
import { FileUploader } from './components/FileUploader';
import { syncAccountsWithSupabase } from './lib/accountUtils';
import { invalidateAccounts, clearAccountsCache } from './lib/accountsStore';
import { parseFile } from './lib/parser';
import { readImportMeta, writeImportMeta, clearImportMeta, summarizeImport, type ImportMeta } from './lib/importing';
import { ImportStatementDialog, type ImportState } from './components/ImportStatementDialog';
import { BottomNav } from './components/BottomNav';
import { DashboardPage } from './pages/DashboardPage';
import { CategoryInsights } from './pages/CategoryInsights';
import { IncomeInsights } from './pages/IncomeInsights';
import { PaycheckPage } from './pages/PaycheckPage';
import { TrendsPage } from './pages/TrendsPage';
import { AccountsPage } from './pages/AccountsPage';
import { WishlistPage } from './pages/WishlistPage';
import { AIExportPage } from './pages/AIExportPage';
import { SettingsPage } from './pages/SettingsPage';
import { TripAnalyticsPage } from './pages/TripAnalyticsPage';
import { TravelIndexPage } from './pages/TravelIndexPage';
import { CurrencyRatesPage } from './pages/CurrencyRatesPage';
import { RecurringPage } from './pages/RecurringPage';
import { Navigation } from './components/Navigation';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { ConfirmDialog } from './components/ConfirmDialog';
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
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [showAuth, setShowAuth] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(() => readImportMeta());
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const importInputRef = useRef<HTMLInputElement>(null);
  const dataLoadedRef = useRef(false);


  // Navigation items handled in Navigation component

  // 1. Resolve the auth session (and subscribe to changes) before deciding what to render.
  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUserEmail(session?.user?.email);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserEmail(session?.user?.email);
      setAuthReady(true);
      // On sign-out, allow local data to load again on the next sign-in, and drop the
      // cached wallet list so the next account never sees the previous one's.
      if (!session) {
        dataLoadedRef.current = false;
        clearAccountsCache();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Reads the device copy into state. Also used after a wallet rename/merge re-points
  // operations in Dexie, so the pages see the new names without a reload.
  const reloadFromDb = async () => {
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
    }
  };

  // 2. Load locally-stored transactions once the session is actually known.
  //    (Previously this ran once on mount reading a stale `session` closure that was
  //     still null, so it never loaded data after the session resolved — the app showed
  //     the landing page on every reload even when signed in with data on device.)
  useEffect(() => {
    if (!authReady) return;

    // Only auto-load data from DB if we have a session.
    if (!session) {
      setIsLoading(false);
      return;
    }

    if (dataLoadedRef.current) return; // don't reload on token refresh
    dataLoadedRef.current = true;

    reloadFromDb().finally(() => setIsLoading(false));
  }, [session, authReady]);

  // Replaces whatever is on the device with a freshly parsed statement. Used by the
  // landing-page uploader and by "Import statement" while data is already loaded.
  // Resolves with the wallets the account sync created (empty when signed out).
  const applyImport = async (data: Transaction[], fileName?: string): Promise<string[]> => {
    // UI PREFERENCE: Sort Newest First (Desc)
    data.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.index || 0) - (b.index || 0);
    });

    setTransactions(data);
    await db.transactions.clear();
    await db.transactions.bulkAdd(data);

    const meta: ImportMeta = {
      at: new Date().toISOString(),
      count: data.length,
      fileName,
      latestDate: data.reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null),
    };
    writeImportMeta(meta);
    setImportMeta(meta);

    // Sync newly discovered accounts to Supabase, then let every mounted wallet list
    // know the set of wallets may have grown.
    if (session?.user?.id) {
      const created = await syncAccountsWithSupabase(data, session.user.id);
      await invalidateAccounts();
      return created;
    }
    return [];
  };

  const handleDataLoaded = async (data: Transaction[], fileName?: string) => {
    await applyImport(data, fileName);
  };

  // "Import statement" opens the OS file picker straight away (must happen inside the
  // click handler); the dialog only appears once a file has been chosen.
  const requestImport = () => importInputRef.current?.click();

  const finishImport = async (data: Transaction[], fileName: string) => {
    const summary = summarizeImport(transactions, data);
    setImportState({ status: 'applying', fileName });
    try {
      const newAccounts = await applyImport(data, fileName);
      setImportState({ status: 'done', fileName, summary, newAccounts });
    } catch (err) {
      console.error('Import failed:', err);
      setImportState({ status: 'error', fileName, message: err instanceof Error ? err.message : 'Could not save the data' });
    }
  };

  const handleImportFile = async (file: File) => {
    setImportState({ status: 'parsing', fileName: file.name });
    let data: Transaction[];
    try {
      data = await parseFile(file);
    } catch (err) {
      console.error('Failed to parse statement:', err);
      setImportState({ status: 'error', fileName: file.name, message: err instanceof Error ? err.message : 'Failed to parse file' });
      return;
    }
    // Nothing is replaced until the file parsed cleanly. A file much smaller than the
    // current data is probably the wrong export — ask before dropping history.
    const summary = summarizeImport(transactions, data);
    if (summary.looksTruncated) {
      setImportState({ status: 'confirm', fileName: file.name, summary, data });
      return;
    }
    await finishImport(data, file.name);
  };

  // Wiping local data means re-uploading the statement to get it back, so every
  // entry point (header menu, mobile menu) goes through a confirmation first.
  const requestReset = () => setIsResetDialogOpen(true);

  const handleReset = async () => {
    setIsResetDialogOpen(false);
    setTransactions([]);
    await db.transactions.clear();
    clearImportMeta();
    setImportMeta(null);
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
          <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-gradient-to-br from-emerald-50/20 to-cyan-50/20 rounded-full blur-[80px] md:blur-[160px] mix-blend-multiply opacity-30 animate-blob transition-all duration-1000" />

          {/* Bottom Left Blob - Ghostly */}
          <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tr from-teal-50/20 to-emerald-50/10 rounded-full blur-[80px] md:blur-[160px] mix-blend-multiply opacity-30 animate-blob animation-delay-4000 transition-all duration-1000" />

          {/* Center - Almost invisible shimmer */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-white/40 rounded-full blur-[100px] md:blur-[180px] opacity-20 animate-pulse-slow" />
        </div>
      )}

      {/* Navigation */}
      <Navigation
        onReset={requestReset}
        onImport={transactions.length > 0 ? requestImport : undefined}
        isAuthenticated={!!session}
        onSignIn={() => setShowAuth(true)}
        onLogout={handleLogout}
        userEmail={userEmail}
        isLandingPage={transactions.length === 0}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-24 pb-8 relative">
        {
          transactions.length === 0 ? (
            <div className="min-h-[80vh] md:min-h-[85vh] flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-1000 relative">

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
              <div className="text-center mb-6 md:mb-8 max-w-4xl relative z-10 px-2 lg:px-0">
                <h2 className="text-4xl md:text-7xl font-extrabold tracking-tight text-emerald-950 mb-3 md:mb-6 leading-tight">
                  Your Personal <br className="hidden md:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                    Financial Analytics
                  </span>
                </h2>
                <p className="text-emerald-800/60 text-base md:text-xl font-medium tracking-wide max-w-2xl mx-auto leading-relaxed">
                  Transform statements into insights. <br className="hidden md:block" />
                  Secure, private, and beautifully visualized.
                </p>
              </div>

              <FileUploader onDataLoaded={handleDataLoaded} isAuthenticated={!!session} onSignIn={() => setShowAuth(true)} />

              {/* Comprehensive Features Grid - Hidden on mobile as per user request */}
              <div className="mt-12 md:mt-32 w-full hidden md:block">
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
                <Route path="/" element={<DashboardPage transactions={transactions} importMeta={importMeta} onImport={requestImport} />} />
                <Route path="/category-insights" element={<CategoryInsights transactions={transactions} />} />
                <Route path="/income-insights" element={<IncomeInsights transactions={transactions} />} />
                <Route path="/paycheck" element={<PaycheckPage transactions={transactions} />} />
                <Route path="/trends" element={<TrendsPage transactions={transactions} />} />
                <Route path="/wishlist" element={<WishlistPage transactions={transactions} />} />
                <Route path="/accounts" element={<AccountsPage transactions={transactions} userId={session?.user?.id} onTransactionsChanged={reloadFromDb} />} />
                <Route path="/ai-export" element={<AIExportPage transactions={transactions} />} />
                <Route path="/trip-analytics" element={<TripAnalyticsPage transactions={transactions} />} />
                <Route path="/travel-index" element={<TravelIndexPage transactions={transactions} />} />
                <Route path="/currency-rates" element={<CurrencyRatesPage transactions={transactions} />} />
                <Route path="/recurring" element={<RecurringPage transactions={transactions} />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          )
        }
      </main >
      {transactions.length > 0 && <BottomNav onReset={requestReset} onImport={requestImport} />}

      {/* Shared picker for every "Import statement" entry point. Resetting value lets the
          same file be chosen twice in a row (e.g. after fixing an export). */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleImportFile(file);
        }}
      />
      <ImportStatementDialog
        state={importState}
        onClose={() => setImportState({ status: 'idle' })}
        onRetry={() => { setImportState({ status: 'idle' }); requestImport(); }}
        onConfirmReplace={() => {
          if (importState.status === 'confirm') finishImport(importState.data, importState.fileName);
        }}
      />

      <ConfirmDialog
        isOpen={isResetDialogOpen}
        title="Clear imported data?"
        description="This removes the transactions stored on this device. Wallets, goals and settings stay in your account — you'll just need to upload the statement again."
        confirmLabel="Clear data"
        tone="danger"
        onConfirm={handleReset}
        onCancel={() => setIsResetDialogOpen(false)}
      />
    </div >
  );
}


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
