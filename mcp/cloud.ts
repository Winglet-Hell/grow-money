import type { Transaction, WalletSnapshot } from '../src/types';
import type { WalletHistory } from '../src/lib/netWorth';
import { kindOf, madeAtOf, type Statement } from './statementFile';
import { selectRows, type UserToken } from './supabaseRest';

// The statement as the app keeps a copy of it in the account (the `statements` table, written by
// lib/statementCloud on every signed-in import): what the online server reads in place of the file
// in ~/Downloads. The copy is about a megabyte, so it is fetched again only when it has changed.

interface StatementRow {
    file_name: string | null;
    imported_at: string;
    transactions: Transaction[];
    wallet_history: WalletHistory | null;
    updated_at: string;
}

/** The account holds no statement yet, or the table for it is missing. */
export class NoCloudStatement extends Error {}

// The copy keeps each wallet's day-by-day balance; its balance is the last of them.
const snapshotOf = (history: WalletHistory): WalletSnapshot => ({
    asOf: history.asOf,
    wallets: history.wallets.map(w => ({ ...w, balance: w.history[w.history.length - 1]?.[1] ?? 0 })),
});

let cache: { userId: string; updatedAt: string; statement: Statement } | null = null;

export async function loadCloudStatement(auth: UserToken): Promise<Statement> {
    const own = { user_id: `eq.${auth.user.id}` };
    let heads: { updated_at: string }[];
    try {
        heads = await selectRows(auth, 'statements', { select: 'updated_at', ...own });
    } catch (e) {
        throw new NoCloudStatement(`The account has no place for the statement yet (${e instanceof Error ? e.message : String(e)}): run supabase_migration_statements.sql.`);
    }
    const head = heads[0];
    if (!head) {
        throw new NoCloudStatement('The Grow Money account holds no statement yet: import a backup of the expense app into Grow Money while signed in, and its copy is kept for Claude.');
    }
    if (cache?.userId === auth.user.id && cache.updatedAt === head.updated_at) return cache.statement;

    const [row] = await selectRows<StatementRow>(auth, 'statements', { select: 'file_name,imported_at,transactions,wallet_history,updated_at', ...own });
    if (!row) throw new NoCloudStatement('The statement was removed from the account while it was being read.');
    const name = row.file_name || 'statement';
    const statement: Statement = {
        file: { path: 'account', name, kind: kindOf(name), madeAt: madeAtOf(name), modified: row.imported_at, size: 0, storedIn: 'account' },
        // Newest first, the order App.applyImport stores them in.
        transactions: [...row.transactions].sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : (a.index || 0) - (b.index || 0))),
        ...(row.wallet_history ? { backup: { wallets: snapshotOf(row.wallet_history), categories: [] } } : {}),
    };
    cache = { userId: auth.user.id, updatedAt: row.updated_at, statement };
    return statement;
}
