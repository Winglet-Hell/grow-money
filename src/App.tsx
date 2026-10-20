import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { UserSettingsProvider } from './contexts/UserSettingsContext';

import { db } from './lib/db';
import { Landing } from './components/Landing';
import { syncAccountsWithSupabase, syncWalletsFromBackup, type WalletSyncReport } from './lib/accountUtils';
import { invalidateAccounts, clearAccountsCache } from './lib/accountsStore';
import { clearTripsCache, healTrips, loadTrips } from './lib/tripsStore';
import { clearCategoryLimitsCache } from './hooks/useCategoryLimits';
import { parseFile, type ParsedStatement } from './lib/parser';
import { readImportMeta, summarizeImport, type ImportMeta } from './lib/importing';
import { writeWalletHistory } from './lib/netWorth';
import { rememberAppCategories } from './lib/categoryIcons';
import type { CloudHead } from './lib/statementCloud';
import { clearDevice, deviceMeta, loadFromAccount, newestFirst, noteEdited, saveImported, storeStatement, syncStatement, type SyncOutcome } from './lib/statementSync';
import { ImportStatementDialog, type ImportState } from './components/ImportStatementDialog';
import { AccountCopyCard } from './components/AccountCopyCard';
import { BottomNav } from './components/BottomNav';
import { DashboardPage } from './pages/DashboardPage';
import { CategoryInsights } from './pages/CategoryInsights';
import { IncomeInsights } from './pages/IncomeInsights';
import { PaycheckPage } from './pages/PaycheckPage';
import { TrendsPage } from './pages/TrendsPage';
import { AccountsPage } from './pages/AccountsPage';
import { GoalsPage } from './pages/GoalsPage';
import { AIExportPage } from './pages/AIExportPage';
import { SettingsPage } from './pages/SettingsPage';
import { TripAnalyticsPage } from './pages/TripAnalyticsPage';
import { TravelIndexPage } from './pages/TravelIndexPage';
import { CurrencyRatesPage } from './pages/CurrencyRatesPage';
import { RecurringPage } from './pages/RecurringPage';
import { MilestonesPage } from './pages/MilestonesPage';
import { ResalePage } from './pages/ResalePage';
import { OAuthConsentPage } from './pages/OAuthConsentPage';
import { Navigation } from './components/Navigation';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { BackupExtras, Transaction } from './types';

// A sync in the background that failed (offline, say) is tried again on the next look.
const warnSync = (err: unknown) => console.warn("Couldn't compare the statement with the account's copy:", err);

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
  const [isTestData, setIsTestData] = useState(false); // "Try Test Data" is on screen (held in memory only)
  // The account's statement, offered on a device emptied with "Clear data" (or one it failed to reach).
  const [accountCopy, setAccountCopy] = useState<{ head: CloudHead; error?: string; loading?: boolean } | null>(null);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dataLoadedRef = useRef(false);
  const userIdRef = useRef<string | undefined>(undefined); // who is signed in now, for syncs that finish later
  const location = useLocation();


  // Navigation items handled in Navigation component

  // 1. Resolve the auth session (and subscribe to changes) before deciding what to render.
  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      userIdRef.current = session?.user?.id;
      setSession(session);
      setUserEmail(session?.user?.email);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user?.id;
      setSession(session);
      setUserEmail(session?.user?.email);
      setAuthReady(true);
      // On sign-out, allow local data to load again on the next sign-in, and drop the
      // cached wallets and trips so the next account never sees the previous one's.
      if (!session) {
        dataLoadedRef.current = false;
        clearAccountsCache();
        clearTripsCache();
        clearCategoryLimitsCache();
        setAccountCopy(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Reads the device copy into state: the signed-in account's only. Also used after a wallet
  // rename/merge re-points operations in Dexie, so the pages see the new names without a
  // reload. Replaces test data a visitor was looking at before signing in, even when nothing
  // is stored. Resolves with whether there was anything to show.
  const reloadFromDb = async (userId: string): Promise<boolean> => {
    try {
      const meta = deviceMeta(userId);
      const savedTransactions = meta ? await db.transactions.toArray() : [];
      // UI PREFERENCE: Sort Newest First (Desc)
      savedTransactions.sort(newestFirst);
      setTransactions(savedTransactions);
      setImportMeta(meta);
      setIsTestData(false);
      return savedTransactions.length > 0;
    } catch (error) {
      console.error('Error loading data:', error);
      return false;
    }
  };

  // Brings this device's statement and the account's copy in line (lib/statementSync) and shows
  // what came of it — unless the account it ran for is no longer the one signed in. `sync` is
  // loadFromAccount for the landing page's button.
  const syncWithAccount = (userId: string, sync: (userId: string) => Promise<SyncOutcome> = syncStatement) =>
    sync(userId).then(outcome => {
      if (userIdRef.current !== userId) return;
      if (outcome.kind === 'pulled') {
        setTransactions(outcome.transactions);
        setImportMeta(outcome.meta);
        setIsTestData(false);
        // The import that made the copy set the wallets and moved the trips' links in the account too.
        invalidateAccounts();
        loadTrips(true);
      }
      // The copy is offered on a device with nothing to show; once loaded, or gone, it isn't.
      setAccountCopy(outcome.kind === 'offer' ? { head: outcome.head, error: outcome.error } : null);
    });

  // 2. Load locally-stored transactions once the session is actually known.
  //    (Previously this ran once on mount reading a stale `session` closure that was
  //     still null, so it never loaded data after the session resolved — the app showed
  //     the landing page on every reload even when signed in with data on device.)
  //    Then the account's copy: a statement imported on another device comes in, and this
  //    device's goes up when it's the newer one.
  useEffect(() => {
    if (!authReady) return;

    // Only auto-load data from DB if we have a session.
    if (!session) {
      setIsLoading(false);
      return;
    }

    if (dataLoadedRef.current) return; // don't reload on token refresh
    dataLoadedRef.current = true;

    const userId: string = session.user.id;
    (async () => {
      if (await reloadFromDb(userId)) {
        setIsLoading(false);
        syncWithAccount(userId).catch(warnSync);
        return;
      }
      // Nothing on this device yet (a new phone or browser): wait for the account's copy rather
      // than flash the upload screen first — though not for ever on a bad connection. Right
      // after signing in the page is already up, so the wait shows from here.
      setIsLoading(true);
      setLoadingNote('Checking your account for a statement…');
      await Promise.race([syncWithAccount(userId).catch(warnSync), new Promise(resolve => setTimeout(resolve, 10_000))]);
      setLoadingNote(null);
      setIsLoading(false);
    })();
  }, [session, authReady]);

  // 3. Back on the page (from another app or tab, a phone woken up, the network back): a
  //    statement imported elsewhere meanwhile comes in. Unless the copy changed, that costs
  //    one small request for its version.
  const signedInId: string | undefined = session?.user?.id;
  useEffect(() => {
    if (!signedInId) return;
    let lastLook = Date.now();
    const lookAgain = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastLook < 15_000) return;
      lastLook = Date.now();
      syncWithAccount(signedInId).catch(warnSync);
    };
    document.addEventListener('visibilitychange', lookAgain);
    window.addEventListener('online', lookAgain);
    return () => {
      document.removeEventListener('visibilitychange', lookAgain);
      window.removeEventListener('online', lookAgain);
    };
  }, [signedInId]);

  // Replaces whatever is on the device with a freshly parsed statement. Every import comes
  // here through handleImportFile: the import screen's drop zone and "Import statement" alike.
  // Resolves with what happened to the wallets (nothing when signed out), and, signed in, the
  // save of the account's copy — what the other devices and Claude read — which goes on in
  // the background.
  const applyImport = async (data: Transaction[], fileName?: string, backup?: BackupExtras): Promise<{ newAccounts: string[]; walletSync?: WalletSyncReport; copy?: Promise<void> }> => {
    // UI PREFERENCE: Sort Newest First (Desc)
    data.sort(newestFirst);
    const userId: string | undefined = session?.user?.id;

    // A backup's balance history and category looks, stored before the new statement reaches the
    // pages that read them. An export has neither and leaves the last backup's in place.
    if (backup) {
      writeWalletHistory(backup.wallets);
      rememberAppCategories(backup.categories);
    }
    setTransactions(data);
    setIsTestData(false);
    setAccountCopy(null);

    const meta: ImportMeta = {
      at: new Date().toISOString(),
      count: data.length,
      fileName,
      latestDate: data.reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null),
      // Signed in, it goes to the account next, in place of what the account held.
      ...(userId ? { userId, version: deviceMeta(userId)?.version, unsaved: 'import' as const } : {}),
    };
    await storeStatement(data, meta);
    setImportMeta(meta);

    // Bring the wallets up to date, then let every mounted wallet list know. A backup sets them
    // as the expense app has them and moves the trips' links to the app's own ids; an export
    // only adds the wallets its operations name.
    if (userId) {
      const copy = saveImported(userId, data, meta);
      copy.catch(() => undefined); // handled by the caller once the wallets are done; no unhandled rejection meanwhile
      const result = backup
        ? { newAccounts: [], walletSync: await syncWalletsFromBackup(backup.wallets, userId) }
        : { newAccounts: await syncAccountsWithSupabase(data, userId) };
      if (backup) await healTrips(data).catch(err => console.error('Moving trip links failed:', err));
      await invalidateAccounts();
      return { ...result, copy };
    }
    return { newAccounts: [] };
  };


  // "Try Test Data" is a look around for signed-out visitors, so it is held in memory only.
  // Going through applyImport would replace the statement stored on this device — signing
  // out keeps it there for the next sign-in — with the demo rows.
  const loadTestData = (data: Transaction[]) => {
    data.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : (a.index || 0) - (b.index || 0)));
    setTransactions(data);
    setIsTestData(true);
    setImportMeta({
      at: new Date().toISOString(),
      count: data.length,
      fileName: 'Test data',
      latestDate: data.reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null),
    });
  };

  // "Import statement" opens the OS file picker straight away (must happen inside the
  // click handler); the dialog only appears once a file has been chosen.
  const requestImport = () => importInputRef.current?.click();

  const finishImport = async (data: Transaction[], fileName: string, backup?: BackupExtras) => {
    const summary = summarizeImport(transactions, data);
    setImportState({ status: 'applying', fileName });
    try {
      const { newAccounts, walletSync, copy } = await applyImport(data, fileName, backup);
      setImportState({ status: 'done', fileName, summary, newAccounts, walletSync, ...(copy ? { copy: { status: 'saving' } } : {}) });
      // The dialog says how the account's copy went, while it is still open on this import.
      copy?.then(
        () => setImportState(s => (s.status === 'done' && s.fileName === fileName ? { ...s, copy: { status: 'saved' } } : s)),
        (err: unknown) => setImportState(s => (s.status === 'done' && s.fileName === fileName
          ? { ...s, copy: { status: 'failed', message: err instanceof Error ? err.message : String(err) } }
          : s)),
      );
    } catch (err) {
      console.error('Import failed:', err);
      setImportState({ status: 'error', fileName, message: err instanceof Error ? err.message : 'Could not save the data' });
    }
  };

  const handleImportFile = async (file: File) => {
    setImportState({ status: 'parsing', fileName: file.name });
    let parsed: ParsedStatement;
    try {
      parsed = await parseFile(file);
    } catch (err) {
      console.error('Failed to parse statement:', err);
      setImportState({ status: 'error', fileName: file.name, message: err instanceof Error ? err.message : 'Failed to parse file' });
      return;
    }
    // Nothing is replaced until the file parsed cleanly. A file much smaller than the
    // current data is probably the wrong export — ask before dropping history.
    const { transactions: data, backup } = parsed;
    const summary = summarizeImport(transactions, data);
    if (summary.looksTruncated) {
      setImportState({ status: 'confirm', fileName: file.name, summary, data, backup });
      return;
    }
    await finishImport(data, file.name, backup);
  };

  // Wiping local data means re-uploading the statement to get it back, so every
  // entry point (header menu, mobile menu) goes through a confirmation first.
  // Test data was never stored: clearing it just closes the demo and leaves the device copy alone.
  const requestReset = () => (isTestData ? closeTestData() : setIsResetDialogOpen(true));

  const closeTestData = () => {
    setTransactions([]);
    setIsTestData(false);
    setImportMeta(readImportMeta());
  };

  const handleReset = async () => {
    setIsResetDialogOpen(false);
    setTransactions([]);
    setImportMeta(null);
    await clearDevice();
    // The account keeps its copy: offered here to load back, never brought back unasked.
    if (session?.user?.id) syncWithAccount(session.user.id).catch(warnSync);
  };

  // A wallet renamed or merged re-pointed operations on this device: show them, and save them
  // to the account so the other devices get the new names too.
  const handleOperationsEdited = async () => {
    const userId: string | undefined = session?.user?.id;
    if (!userId) return;
    noteEdited(userId);
    await reloadFromDb(userId);
    syncWithAccount(userId).catch(warnSync);
  };

  // "Load from account" on the landing page.
  const loadAccountCopy = () => {
    const userId: string | undefined = session?.user?.id;
    if (!userId || !accountCopy) return;
    const { head } = accountCopy;
    setAccountCopy({ head, loading: true });
    syncWithAccount(userId, loadFromAccount).catch((err: unknown) => {
      if (userIdRef.current === userId) setAccountCopy({ head, error: err instanceof Error ? err.message : String(err) });
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Optional: Clear local data on logout? 
    // await handleReset(); 
  };

  // Connecting Claude, ChatGPT or another app: its own page, with or without imported data.
  if (location.pathname === '/oauth/consent') {
    return <OAuthConsentPage session={session} authReady={authReady} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-emerald-50 px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        {loadingNote && <p className="text-sm font-medium text-emerald-800/60 text-center">{loadingNote}</p>}
      </div>
    );
  }

  // If not authenticated and explicitly asked for auth, show Auth screen
  if (!session && showAuth) {
    return <Auth onLogin={() => setShowAuth(false)} onBack={() => setShowAuth(false)} />;
  }


  return (
    <div className={`min-h-screen pb-4 md:pb-8 font-sans selection:bg-emerald-200 selection:text-emerald-900 overflow-x-hidden relative transition-colors duration-700 ${transactions.length > 0 ? 'bg-slate-50' : 'bg-[#F0FDF9]'}`}>
      {/* Navigation */}
      <Navigation
        onReset={requestReset}
        onImport={transactions.length > 0 ? requestImport : undefined}
        importMeta={importMeta}
        isAuthenticated={!!session}
        onSignIn={() => setShowAuth(true)}
        onLogout={handleLogout}
        userEmail={userEmail}
        isLandingPage={transactions.length === 0}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-24 pb-8 relative">
        {
          transactions.length === 0 ? (
            <Landing
              isAuthenticated={!!session}
              onSignIn={() => setShowAuth(true)}
              onTestData={loadTestData}
              onFile={handleImportFile}
              onChooseFile={requestImport}
              accountCopy={session && accountCopy ? (
                <AccountCopyCard head={accountCopy.head} error={accountCopy.error} loading={!!accountCopy.loading} onLoad={loadAccountCopy} />
              ) : undefined}
            />
          ) : (
            // Logged in Dashboard View - Clean layout
            // No entrance of its own: each page fades in itself, and both together slid in twice.
            <div>
              <Routes>
                {/* ... existing routes ... */}
                <Route path="/" element={<DashboardPage transactions={transactions} onImport={requestImport} />} />
                <Route path="/category-insights" element={<CategoryInsights transactions={transactions} />} />
                <Route path="/income-insights" element={<IncomeInsights transactions={transactions} />} />
                <Route path="/paycheck" element={<PaycheckPage transactions={transactions} />} />
                <Route path="/trends" element={<TrendsPage transactions={transactions} />} />
                <Route path="/wishlist" element={<GoalsPage transactions={transactions} userId={session?.user?.id} />} />
                <Route path="/accounts" element={<AccountsPage transactions={transactions} userId={session?.user?.id} onTransactionsChanged={handleOperationsEdited} />} />
                <Route path="/ai-export" element={<AIExportPage transactions={transactions} />} />
                <Route path="/trip-analytics" element={<TripAnalyticsPage transactions={transactions} />} />
                <Route path="/trip-analytics/:tripId" element={<TripAnalyticsPage transactions={transactions} />} />
                <Route path="/travel-index" element={<TravelIndexPage transactions={transactions} />} />
                <Route path="/currency-rates" element={<CurrencyRatesPage transactions={transactions} />} />
                <Route path="/recurring" element={<RecurringPage transactions={transactions} />} />
                <Route path="/milestones" element={<MilestonesPage transactions={transactions} />} />
                <Route path="/resale" element={<ResalePage transactions={transactions} />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          )
        }
      </main >
      {transactions.length > 0 && <BottomNav onReset={requestReset} onImport={requestImport} importMeta={importMeta} />}

      {/* Shared picker for every "Import statement" entry point. Resetting value lets the
          same file be chosen twice in a row (e.g. after fixing an export).
          iOS keeps only the extensions it knows a MIME type for, so ".mmbackup" alone left the
          backup greyed out in Files. application/octet-stream (any file) lets it be picked there;
          parseFile turns away whatever isn't a statement. */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.mmbackup,application/octet-stream"
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
          if (importState.status === 'confirm') finishImport(importState.data, importState.fileName, importState.backup);
        }}
      />

      <ConfirmDialog
        isOpen={isResetDialogOpen}
        title="Clear imported data?"
        description="This removes the transactions stored on this device. Your account keeps its copy, along with wallets, goals and settings — load it back here or upload a statement again."
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

export default App;
