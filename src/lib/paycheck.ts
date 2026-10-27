import type { CommissionChange, PaycheckJob } from '../types';

// A job's commission rate can change over time — a raise from some month on.
// commissionPct is the rate from the start; each change holds from its
// work-month until the next one, so the months before keep what they were paid.

// The commission % for a work-month ("YYYY-MM").
export const commissionPctFor = (job: PaycheckJob, monthKey: string): number => {
    let pct = job.commissionPct ?? 0;
    let since = '';
    for (const c of job.commissionChanges ?? []) {
        if (c.monthKey <= monthKey && c.monthKey >= since) {
            pct = c.pct;
            since = c.monthKey;
        }
    }
    return pct;
};

// Whether any month of the job is paid a commission.
export const hasCommission = (job: PaycheckJob): boolean =>
    (job.commissionPct ?? 0) > 0 || (job.commissionChanges ?? []).some((c) => c.pct > 0);

// Sorted, with the changes that leave the rate as it was dropped, so the list
// holds only real raises and cuts.
const tidy = (
    startPct: number,
    changes: CommissionChange[]
): Pick<PaycheckJob, 'commissionPct' | 'commissionChanges'> => {
    const kept: CommissionChange[] = [];
    let pct = startPct;
    for (const c of [...changes].sort((a, b) => a.monthKey.localeCompare(b.monthKey))) {
        if (c.pct === pct) continue;
        kept.push(c);
        pct = c.pct;
    }
    return { commissionPct: startPct, commissionChanges: kept.length > 0 ? kept : undefined };
};

// The job's rates once `pct` holds from `monthKey` on (null = from the start),
// up to the next change already on record.
export const commissionFrom = (job: PaycheckJob, monthKey: string | null, pct: number) => {
    const changes = job.commissionChanges ?? [];
    return monthKey === null
        ? tidy(pct, changes)
        : tidy(job.commissionPct ?? 0, [...changes.filter((c) => c.monthKey !== monthKey), { monthKey, pct }]);
};

// The job's rates with the change at `monthKey` undone: those months go back
// to the rate before it.
export const withoutCommissionChange = (job: PaycheckJob, monthKey: string) =>
    tidy(
        job.commissionPct ?? 0,
        (job.commissionChanges ?? []).filter((c) => c.monthKey !== monthKey)
    );
