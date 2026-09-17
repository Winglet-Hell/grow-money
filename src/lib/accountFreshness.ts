import type { AccountStatus } from '../hooks/useAccounts';

const DAY_MS = 86_400_000;

/** "today", "3 days ago", "2 months ago" — how long since the balance was typed in. */
export function describeAge(iso: string | undefined, now = new Date()): string | null {
    if (!iso) return null;
    const then = new Date(iso);
    if (isNaN(then.getTime())) return null;
    const days = Math.floor((now.getTime() - then.getTime()) / DAY_MS);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
}

/** The balance was entered before the newest operations touching this wallet. */
export const isStale = (a: AccountStatus) => a.isStored && a.txSinceBalance > 0;

/** Editable text for a balance: plain decimals, no grouping, no "2e-8". */
export const balanceText = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 12 }) : '';
