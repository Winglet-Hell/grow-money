import { useMemo, useState } from 'react';
import { Wifi, WifiOff, Plus, Eye, EyeOff, ListChecks, AlertTriangle, Wallet, PieChart, Clock, ArrowUp, ArrowDown, ArrowUpDown, Activity, Layers } from 'lucide-react';
import type { Transaction, Account } from '../types';
import { useAccounts, type AccountStatus } from '../hooks/useAccounts';
import { usePrivacy } from '../contexts/PrivacyContext';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { EditAccountModal } from '../components/EditAccountModal';
import { UpdateBalancesModal } from '../components/UpdateBalancesModal';
import { WalletRow, WALLET_GRID } from '../components/WalletRow';
import { isStale } from '../lib/accountFreshness';
import { createManualAccount, updateAccount } from '../lib/accountUtils';
import { getCurrencyMeta, formatCurrencyAmount } from '../lib/currencies';
import { cn } from '../lib/utils';

interface AccountsPageProps {
    transactions: Transaction[];
    userId?: string;
    onTransactionsChanged?: () => void; // a rename/merge re-pointed local operations
}

type SortKey = 'value' | 'name' | 'updated' | 'activity';
type SortDir = 'asc' | 'desc';

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

// Per-device view preference: grouped by currency (default) or one flat sorted list.
const GROUPED_KEY = 'walletsGrouped';
const readGrouped = () => { try { return localStorage.getItem(GROUPED_KEY) !== 'false'; } catch { return true; } };
const storeGrouped = (v: boolean) => { try { localStorage.setItem(GROUPED_KEY, String(v)); } catch { /* storage blocked */ } };

// Net-worth exposure groups: dollar stablecoins are dollars for this purpose.
const EXPOSURE_COLORS: Record<string, string> = {
    RUB: '#10b981',
    USD: '#3b82f6',
    THB: '#f59e0b',
    BTC: '#f97316',
    ETH: '#8b5cf6',
    Other: '#94a3b8',
};
// Colour bucket for the exposure bar (small currencies share "Other").
const exposureGroup = (currency: string) => {
    if (currency === 'USDT' || currency === 'USDC' || currency === 'USD') return 'USD';
    return currency in EXPOSURE_COLORS ? currency : 'Other';
};
// Table groups: one per currency family, so "how much THB do I have in total" has an
// answer. Dollar stablecoins sit with dollars — they are dollars for every practical purpose.
const currencyFamily = (currency: string) => (currency === 'USDT' || currency === 'USDC' ? 'USD' : currency);
const familyLabel = (family: string) => (family === 'USD' ? 'USD · USDT · USDC' : `${family} · ${getCurrencyMeta(family).name}`);
// What can actually halve in a bad month: coins with a price of their own, not stablecoins.
const isVolatile = (currency: string) => currencyFamily(currency) !== 'USD' && getCurrencyMeta(currency).kind === 'crypto';

export function AccountsPage({ transactions, userId, onTransactionsChanged }: AccountsPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { accounts: accountsStatus, totalNetWorth, isLoadingRates, isLiveRates, refreshAccounts } = useAccounts(transactions);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isUpdateAllOpen, setIsUpdateAllOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<AccountStatus | null>(null);
    const [showEmpty, setShowEmpty] = useState(false);
    const [grouped, setGroupedState] = useState<boolean>(readGrouped);
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'value', dir: 'desc' });
    const setGrouped = (v: boolean) => { setGroupedState(v); storeGrouped(v); };

    const money = (n: number) => (isPrivacyMode ? '••••••' : rub.format(n));

    const withBalance = useMemo(() => accountsStatus.filter(a => a.current !== 0), [accountsStatus]);
    const staleCount = useMemo(() => withBalance.filter(isStale).length, [withBalance]);
    const undatedCount = useMemo(() => withBalance.filter(a => a.isStored && !a.balance_date).length, [withBalance]);

    // Where the net worth sits, by currency family — the wealth-side counterpart of the
    // spend-by-currency chart on the analytics pages.
    const exposure = useMemo(() => {
        const byGroup = new Map<string, number>();
        accountsStatus.forEach(a => {
            if (!a.hasRate || a.rubEquivalent <= 0) return;
            const g = exposureGroup(a.currency);
            byGroup.set(g, (byGroup.get(g) ?? 0) + a.rubEquivalent);
        });
        const total = Array.from(byGroup.values()).reduce((s, v) => s + v, 0);
        return Array.from(byGroup.entries())
            .map(([group, value]) => ({ group, value, share: total > 0 ? value / total : 0 }))
            .sort((a, b) => b.value - a.value);
    }, [accountsStatus]);

    const volatile = useMemo(() => {
        const valued = accountsStatus.filter(a => a.hasRate);
        const total = valued.reduce((s, a) => s + a.rubEquivalent, 0);
        const wallets = valued.filter(a => isVolatile(a.currency) && a.current !== 0);
        const value = wallets.reduce((s, a) => s + a.rubEquivalent, 0);
        const coins = [...new Set(wallets.map(a => a.currency))];
        return { value, share: total > 0 ? value / total : 0, wallets: wallets.length, coins };
    }, [accountsStatus]);

    const groups = useMemo(() => {
        const dir = sort.dir === 'asc' ? 1 : -1;
        const compare = (a: AccountStatus, b: AccountStatus) => {
            switch (sort.key) {
                case 'name': return a.name.localeCompare(b.name) * dir;
                case 'updated': {
                    // Undated balances are the least trustworthy — they sort as the oldest.
                    const av = a.balance_date ?? '';
                    const bv = b.balance_date ?? '';
                    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
                }
                case 'activity': {
                    const av = a.lastActivity ?? '';
                    const bv = b.lastActivity ?? '';
                    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
                }
                default: return (a.rubEquivalent - b.rubEquivalent) * dir || a.name.localeCompare(b.name);
            }
        };
        // "Empty" means a zero balance — nothing else. Thresholding on 0.01 used to hide
        // small crypto holdings that were worth thousands of rubles.
        const visible = accountsStatus.filter(a => showEmpty || a.current !== 0);
        const sorted = [...visible].sort(compare);
        if (!grouped) {
            // One flat list: the sort applies across every wallet, which is what "oldest
            // balance first" or "most recently used" actually needs.
            return [{ family: '', rows: sorted, total: 0, nativeTotal: null }];
        }
        const byFamily = new Map<string, AccountStatus[]>();
        for (const a of sorted) {
            const f = currencyFamily(a.currency);
            (byFamily.get(f) ?? byFamily.set(f, []).get(f)!).push(a);
        }
        // Groups by their total value, biggest first; the rows inside keep the chosen sort.
        return Array.from(byFamily.entries())
            .map(([family, rows]) => ({
                family,
                rows,
                total: rows.filter(a => a.hasRate).reduce((s, a) => s + a.rubEquivalent, 0),
                // Native total only makes sense within one real currency (not the dollar mix).
                nativeTotal: family === 'USD' ? null : rows.reduce((s, a) => s + a.current, 0),
            }))
            .sort((a, b) => b.total - a.total || a.family.localeCompare(b.family));
    }, [accountsStatus, showEmpty, sort, grouped]);

    const toggleSort = (key: SortKey) => setSort(prev => ({
        key,
        dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc',
    }));

    const handleCreateAccount = async (name: string, currency: string, balance: number, type: Account['type']) => {
        if (userId) {
            await createManualAccount(userId, name, currency, balance, type);
            // Refresh accounts list
            if (refreshAccounts) refreshAccounts();
        }
    };

    const handleEditSave = () => {
        if (refreshAccounts) refreshAccounts();
    };

    // Inline / bulk balance edits: persist the number with today's date. A discovered
    // (not yet stored) wallet gets its row created on the way.
    const saveBalance = async (account: AccountStatus, balance: number) => {
        await updateAccount(account.id, {
            name: account.name,
            currency: account.currency,
            type: account.type,
            balance,
            balance_date: new Date().toISOString(),
        });
        if (refreshAccounts) await refreshAccounts();
    };

    const sortIcon = (column: SortKey) => {
        if (sort.key !== column) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
        return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />;
    };
    const headerCell = (label: string, column?: SortKey, className?: string) => column ? (
        <button
            type="button"
            onClick={() => toggleSort(column)}
            className={cn("flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors select-none", className)}
        >
            {label}
            {sortIcon(column)}
        </button>
    ) : (
        <div className={cn("text-[11px] font-semibold uppercase tracking-wider text-gray-500", className)}>{label}</div>
    );

    const renderGroup = (group: { family: string; rows: AccountStatus[]; total: number; nativeTotal: number | null }) => (
        <div key={group.family || 'all'}>
            {group.family && <div className="flex items-baseline justify-between gap-3 px-4 md:px-6 py-2.5 bg-gray-50 border-y border-gray-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EXPOSURE_COLORS[exposureGroup(group.family)] }} />
                    <span className="truncate">{familyLabel(group.family)}</span>
                    <span className="text-xs font-medium text-gray-400 shrink-0">{group.rows.length}</span>
                </div>
                <div className="text-sm font-semibold text-gray-700 tabular-nums text-right shrink-0">
                    {group.nativeTotal !== null && group.family !== 'RUB' && (
                        <span className="text-xs font-medium text-gray-400 mr-2 hidden sm:inline">
                            {isPrivacyMode ? '••••' : formatCurrencyAmount(group.nativeTotal, group.family)}
                        </span>
                    )}
                    {money(group.total)}
                    <span className="text-xs font-medium text-gray-400 ml-2">{totalNetWorth > 0 ? `${Math.round((group.total / totalNetWorth) * 100)}%` : ''}</span>
                </div>
            </div>}
            {group.rows.map(acc => (
                <WalletRow
                    key={acc.id}
                    account={acc}
                    share={totalNetWorth > 0 && acc.hasRate ? acc.rubEquivalent / totalNetWorth : 0}
                    isPrivacyMode={isPrivacyMode}
                    canEdit={!!userId}
                    onEdit={setEditingAccount}
                    onSaveBalance={saveBalance}
                />
            ))}
        </div>
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Wallets</h2>
                    <p className="text-gray-500">
                        Balances are entered by hand — click one to change it.{' '}
                        <span className="inline-flex items-center gap-1 text-gray-400">
                            {isLoadingRates ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : isLiveRates ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
                            {isLoadingRates ? 'updating rates' : isLiveRates ? 'live rates' : 'estimated rates (offline)'}
                        </span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    {userId && (
                        <button
                            onClick={() => setIsUpdateAllOpen(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                            title="Type new balances for several wallets at once"
                        >
                            <ListChecks className="w-4 h-4" />
                            Update all
                        </button>
                    )}
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add wallet
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryTile
                    title="Net worth"
                    value={money(totalNetWorth)}
                    sub={`${withBalance.length} wallets with a balance · ${accountsStatus.length} total`}
                    icon={<Wallet className="w-9 h-9 text-emerald-500" strokeWidth={1.5} />}
                />
                <SummaryTile
                    title="Volatile assets"
                    value={`${Math.round(volatile.share * 100)}%`}
                    sub={volatile.wallets > 0
                        ? `${money(volatile.value)} in ${volatile.coins.join(', ')} · ${volatile.wallets} wallet${volatile.wallets === 1 ? '' : 's'} · stablecoins count as cash`
                        : 'no coins with a price of their own'}
                    icon={<Activity className="w-9 h-9 text-orange-400" strokeWidth={1.5} />}
                />
                {/* Same skeleton as SummaryTile: content column + icon column, so the bar
                    never runs underneath the icon. */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-500 mb-1">By currency</p>
                        {exposure.length > 0 ? (
                            <>
                                <div className="text-2xl font-bold tabular-nums text-gray-900 truncate">
                                    {exposure[0].group === 'USD' ? 'USD·USDT' : exposure[0].group} {Math.round(exposure[0].share * 100)}%
                                </div>
                                <div className="mt-2 h-2 rounded-full overflow-hidden flex bg-gray-100">
                                    {exposure.map(e => (
                                        <div key={e.group} style={{ width: `${e.share * 100}%`, backgroundColor: EXPOSURE_COLORS[e.group] }} title={`${e.group}: ${Math.round(e.share * 100)}%`} />
                                    ))}
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                    {exposure.filter(e => e.share >= 0.005).map(e => (
                                        <span key={e.group} className="inline-flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EXPOSURE_COLORS[e.group] }} />
                                            <span className="font-semibold text-gray-600">{e.group === 'USD' ? 'USD·USDT' : e.group}</span>
                                            {Math.round(e.share * 100)}%
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-gray-400">No valued wallets yet.</p>
                        )}
                    </div>
                    <div className="flex-shrink-0 ml-3">
                        <PieChart className="w-9 h-9 text-blue-400" strokeWidth={1.5} />
                    </div>
                </div>
                <SummaryTile
                    title="Balance freshness"
                    value={staleCount > 0 ? `${staleCount} outdated` : undatedCount > 0 ? `${undatedCount} undated` : 'All current'}
                    sub={
                        staleCount > 0
                            ? `operations came in after these balances were typed${undatedCount ? ` · ${undatedCount} never dated` : ''}`
                            : undatedCount > 0
                                ? 'no update date yet — set balances once to start tracking'
                                : 'every balance is newer than its last operation'
                    }
                    icon={staleCount > 0
                        ? <AlertTriangle className="w-9 h-9 text-amber-500" strokeWidth={1.5} />
                        : <Clock className="w-9 h-9 text-gray-300" strokeWidth={1.5} />}
                    tone={staleCount > 0 ? 'warn' : 'default'}
                    onClick={staleCount > 0 ? () => { setGrouped(false); setSort({ key: 'updated', dir: 'asc' }); } : undefined}
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* View options live with the table they change; sorting is in the column headers
                    on wide screens and in the chips on phones. */}
                <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <button
                        onClick={() => setGrouped(!grouped)}
                        aria-pressed={grouped}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                            grouped ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                        title={grouped ? 'Switch to one flat list' : 'Group wallets by currency'}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Group by currency
                    </button>
                    <button
                        onClick={() => setShowEmpty(v => !v)}
                        aria-pressed={showEmpty}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                            showEmpty ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                        title={showEmpty ? 'Hide zero-balance wallets' : 'Show zero-balance wallets'}
                    >
                        {showEmpty ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showEmpty ? 'Hide empty' : `Show empty (${accountsStatus.length - withBalance.length})`}
                    </button>
                    <div className="md:hidden flex items-center gap-1.5 ml-auto">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sort</span>
                        {([['value', '≈ RUB'], ['name', 'Name'], ['updated', 'Updated'], ['activity', 'Activity']] as [SortKey, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => toggleSort(key)}
                                className={cn("px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap", sort.key === key ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600")}
                            >
                                {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={cn("hidden md:grid items-center gap-x-3 px-6 py-2.5 border-b border-gray-100", WALLET_GRID)}>
                    <div />
                    {headerCell('Wallet', 'name')}
                    {headerCell('Balance', undefined, 'text-right')}
                    {headerCell('≈ RUB', 'value', 'justify-end')}
                    {headerCell('Share')}
                    {headerCell('Updated', 'updated')}
                    {headerCell('Activity', 'activity')}
                    <div />
                </div>
                {groups.map(renderGroup)}
                {groups.length === 0 && (
                    <p className="px-6 py-8 text-sm text-gray-400 italic text-center">No wallets with a balance{showEmpty ? '' : ' — empty ones are hidden'}.</p>
                )}
            </div>

            <CreateAccountModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateAccount}
            />

            <UpdateBalancesModal
                isOpen={isUpdateAllOpen}
                accounts={accountsStatus}
                onClose={() => setIsUpdateAllOpen(false)}
                onSaveBalance={saveBalance}
                onDone={handleEditSave}
            />

            {editingAccount && (
                <EditAccountModal
                    isOpen={!!editingAccount}
                    // Balance is entered manually; prefill with the current stored value.
                    account={{
                        id: editingAccount.id,
                        name: editingAccount.name,
                        currency: editingAccount.currency,
                        balance: editingAccount.current,
                        type: editingAccount.type,
                    }}
                    mergeTargets={accountsStatus.map(a => ({ id: a.id, name: a.name, currency: a.currency, balance: a.current }))}
                    onTransactionsChanged={onTransactionsChanged}
                    onClose={() => setEditingAccount(null)}
                    onSave={handleEditSave}
                />
            )}
        </div>
    );
}

function SummaryTile({ title, value, sub, icon, tone = 'default', onClick }: {
    title: string; value: string; sub?: string; icon: React.ReactNode; tone?: 'default' | 'warn'; onClick?: () => void;
}) {
    const body = (
        <>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <div className={cn("text-2xl font-bold tabular-nums truncate", tone === 'warn' ? "text-amber-600" : "text-gray-900")}>{value}</div>
                {sub && <p className="text-xs text-gray-400 mt-1.5 leading-snug">{sub}</p>}
            </div>
            <div className="flex-shrink-0 ml-3">{icon}</div>
        </>
    );
    const className = "bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between text-left w-full";
    return onClick
        ? <button type="button" onClick={onClick} className={cn(className, "hover:shadow-md hover:border-amber-200 transition-all")}>{body}</button>
        : <div className={className}>{body}</div>;
}
