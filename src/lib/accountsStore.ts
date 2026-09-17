import { supabase } from './supabase';
import type { Account } from '../types';

// The stored wallets, loaded once per session and shared by every mounted useAccounts.
// Anything that changes a wallet (save, delete, merge, the sync after an import) calls
// invalidateAccounts(), which reloads and tells every subscriber. Before this each page
// re-queried Supabase on mount and on every change of the transaction array — on the
// dashboard that meant a query per period switch.

type Listener = () => void;

let cache: { userKey: string; accounts: Account[] } | null = null;
let inflight: Promise<Account[]> | null = null;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach(fn => fn());

async function currentUserKey(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    return user ? user.id : 'anon';
}

async function query(userKey: string): Promise<Account[]> {
    let q = supabase.from('accounts').select('*');
    q = userKey === 'anon' ? q.is('user_id', null) : q.eq('user_id', userKey);
    const { data, error } = await q.order('created_at', { ascending: true });
    if (error) {
        console.error('Error loading accounts:', error);
        return cache?.accounts ?? [];
    }
    return data ?? [];
}

/** Cached wallets for the current user, or null before the first load completes. */
export function getCachedAccounts(): Account[] | null {
    return cache?.accounts ?? null;
}

/** Loads the wallets once; later calls reuse the cache unless `force` is set. */
export async function loadAccounts(force = false): Promise<Account[]> {
    const userKey = await currentUserKey();
    if (!force && cache && cache.userKey === userKey) return cache.accounts;
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const accounts = await query(userKey);
            cache = { userKey, accounts };
            notify();
            return accounts;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/** After a wallet changed on the server: reload and refresh every mounted consumer. */
export function invalidateAccounts(): Promise<Account[]> {
    return loadAccounts(true);
}

export function subscribeAccounts(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** On sign-out the next user must not see the previous one's wallets. */
export function clearAccountsCache(): void {
    cache = null;
    notify();
}
