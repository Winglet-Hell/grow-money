import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Transaction, PaycheckConfig, PaycheckJob, OvertimeEntry, SalesEntry } from '../types';
import {
    Banknote,
    HandCoins,
    Clock,
    Plus,
    Trash2,
    ChevronDown,
    TrendingUp,
    TrendingDown,
    Wallet,
    Check,
    CheckCircle2,
    AlertTriangle,
    CalendarClock,
    Umbrella,
    Briefcase,
    Percent,
    ShoppingBag,
    Pencil,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { MetricCard } from '../components/MetricCard';

interface PaycheckPageProps {
    transactions: Transaction[];
}

const LS_KEY = 'growmoney.paycheck.v1';
const DEFAULT_OT_RATE = 536; // default overtime rate, ₽/hour
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- helpers ----------------------------------------------------------------

const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Shift a "YYYY-MM" key by n months (n can be negative).
const addMonths = (key: string, n: number) => {
    const [y, m] = key.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
};

const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const shortDate = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    if (!m || !d) return iso;
    return `${d} ${MONTHS_SHORT[m - 1] ?? ''}`;
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Which work-month a payment belongs to, from its tags:
//   • "Зарплата" / salary (final settlement) lands early next month → previous work-month
//   • "Аванс" / advance, "Отпуск" / vacation, untagged → the month it landed in
const isFinalTag = (t: Transaction) =>
    (t.tags ?? []).some((x) => /зарплат|salary|расч[её]т|settlement/i.test(x));
const isVacationTag = (t: Transaction) => (t.tags ?? []).some((x) => /отпуск|vacation|holiday/i.test(x));

const workMonthOf = (t: Transaction): string => {
    const dateMonth = t.date.slice(0, 7);
    return isFinalTag(t) ? addMonths(dateMonth, -1) : dateMonth;
};

// ---- jobs -------------------------------------------------------------------

const LEGACY_JOB_ID = 'job-main';
const ORETEX_JOB_ID = 'job-oretex';

// Ozon net profit per work-month, from the payroll sheet. The figure quoted
// with each "Зарплата" settlement belongs to the month that settlement closes
// (paid ~13th of the following month), which is how workMonthOf groups the
// payments themselves. Months before April 2025 predate the commission and are
// deliberately left blank rather than zeroed — back then the salary was lower
// too, so they can't be judged against today's plan.
const ORETEX_SEED_SALES: SalesEntry[] = [
    { monthKey: '2025-04', amount: 491836 },
    { monthKey: '2025-05', amount: 552566 },
    { monthKey: '2025-06', amount: 400858 },
    { monthKey: '2025-07', amount: 955985 },
    { monthKey: '2025-08', amount: 1858466 },
    { monthKey: '2025-09', amount: 2003876 },
    { monthKey: '2025-10', amount: 1286997 },
    { monthKey: '2025-11', amount: 528195 },
    { monthKey: '2025-12', amount: 2107768 },
    { monthKey: '2026-01', amount: 6839058 },
    { monthKey: '2026-02', amount: 6839058 },
    { monthKey: '2026-03', amount: 8340312 },
    { monthKey: '2026-04', amount: 6967096 },
    { monthKey: '2026-05', amount: 3708890 },
    { monthKey: '2026-06', amount: 1829145 },
];

// Second employer: a fixed net salary plus a share of the month's Ozon profit.
// The profit isn't in the bank statement, so it's kept by hand.
const ORETEX_SEED: PaycheckJob = {
    id: ORETEX_JOB_ID,
    name: 'Oretex',
    plannedSalary: 115072.5,
    hourlyRate: 0,
    overtime: [],
    commissionPct: 3,
    salesLabel: 'Ozon profit',
    sales: ORETEX_SEED_SALES,
};

// "Addrea paycheck" → "Addrea", so the tab reads like an employer, not a category.
const jobNameFromCategory = (category?: string) => {
    if (!category) return '';
    const stripped = category
        .replace(/paycheck|зарплата|зп|salary|доход|income/gi, '')
        .replace(/[()\-–—]/g, ' ')
        .trim();
    const name = stripped || category.trim();
    return name.charAt(0).toUpperCase() + name.slice(1);
};

// The Ozon history above is the record of what was actually earned, so it is
// filled in for the Oretex job whether that job is being created here or was
// already migrated before the figures existed. Only ever applies while the job
// holds no figures at all — once a single month is on record, hands off.
const withOretexHistory = (jobs: PaycheckJob[]): PaycheckJob[] =>
    jobs.map((j) =>
        j.id === ORETEX_JOB_ID && (j.sales ?? []).length === 0
            ? { ...j, sales: ORETEX_SEED_SALES, salesLabel: ORETEX_SEED.salesLabel }
            : j
    );

// Jobs can't be created from the page any more, so an empty leftover — no
// source, no plan, no records — is noise from before and is dropped on load.
const isEmptyJob = (j: PaycheckJob) =>
    !j.category && !j.plannedSalary && (j.overtime ?? []).length === 0 && (j.sales ?? []).length === 0;

// Older configs stored a single job inline. Lift it into the jobs array and seed
// the second employer, so both are tracked side by side from the first load.
const normalizeConfig = (raw: PaycheckConfig): PaycheckConfig => {
    if (raw.jobs && raw.jobs.length > 0) {
        const kept = raw.jobs.filter((j) => !isEmptyJob(j));
        const jobs = withOretexHistory(kept.length > 0 ? kept : raw.jobs);
        const activeJobId = jobs.some((j) => j.id === raw.activeJobId) ? raw.activeJobId : jobs[0].id;
        return { ...raw, jobs, activeJobId };
    }
    const main: PaycheckJob = {
        id: LEGACY_JOB_ID,
        name: jobNameFromCategory(raw.category) || 'Main job',
        category: raw.category,
        plannedSalary: raw.plannedSalary,
        hourlyRate: raw.hourlyRate ?? DEFAULT_OT_RATE,
        overtime: raw.overtime ?? [],
    };
    return { ...raw, jobs: [main, { ...ORETEX_SEED }], activeJobId: raw.activeJobId ?? main.id };
};

// The income category holding this job's payments: the explicit choice, else a
// category that carries the job's name, else (for the first job only) the
// salary-looking one.
const resolveCategory = (job: PaycheckJob, incomeCategories: string[], isFirst: boolean): string => {
    if (job.category && incomeCategories.includes(job.category)) return job.category;
    const needle = job.name.trim().toLowerCase();
    if (needle.length >= 3) {
        const byName = incomeCategories.find((c) => c.toLowerCase().includes(needle));
        if (byName) return byName;
    }
    if (!isFirst) return '';
    return (
        incomeCategories.find((c) => /addr?ea|addrrea/i.test(c) && /paycheck/i.test(c)) ||
        incomeCategories.find((c) => /paycheck|зарплат|salary/i.test(c)) ||
        incomeCategories[0] ||
        ''
    );
};

// ---- config hook (Supabase settings + localStorage mirror) ------------------

function usePaycheckConfig() {
    const { settings, updatePreferences, loading } = useUserSettings();
    const [stored, setStored] = useState<PaycheckConfig>(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) return JSON.parse(raw) as PaycheckConfig;
        } catch {
            /* ignore */
        }
        return {};
    });

    // Once server settings arrive, they win (cross-device source of truth).
    useEffect(() => {
        if (loading) return;
        const server = settings.preferences.paycheck;
        if (server) {
            setStored(server);
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(server));
            } catch {
                /* ignore */
            }
        }
    }, [loading, settings.preferences.paycheck]);

    const config = useMemo(() => normalizeConfig(stored), [stored]);

    const save = useCallback(
        (next: PaycheckConfig) => {
            setStored(next);
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            updatePreferences({ paycheck: next });
        },
        [updatePreferences]
    );

    return { config, save, loading };
}

// ---- page -------------------------------------------------------------------

export const PaycheckPage: React.FC<PaycheckPageProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
    const { config, save } = usePaycheckConfig();

    const currentKey = ymKey(new Date());

    const jobs = useMemo(() => config.jobs ?? [], [config.jobs]);

    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [editingJob, setEditingJob] = useState(false);
    const [showAddOt, setShowAddOt] = useState(false);
    const [selectedYear, setSelectedYear] = useState<string | null>(null);

    const activeJob = useMemo(() => {
        const wanted = selectedJobId ?? config.activeJobId;
        return jobs.find((j) => j.id === wanted) ?? jobs[0];
    }, [jobs, selectedJobId, config.activeJobId]);

    const patchJob = useCallback(
        (id: string, patch: Partial<PaycheckJob>) => {
            save({ ...config, jobs: jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
        },
        [config, jobs, save]
    );

    const selectJob = (id: string) => {
        setSelectedJobId(id);
        setEditingJob(false);
        setShowAddOt(false);
        save({ ...config, activeJobId: id });
    };

    const incomeCategories = useMemo(() => {
        const set = new Set<string>();
        transactions.forEach((t) => {
            if (t.type === 'income' && t.category) set.add(t.category);
        });
        return Array.from(set).sort();
    }, [transactions]);

    const effectiveCategory = useMemo(
        () => (activeJob ? resolveCategory(activeJob, incomeCategories, jobs[0]?.id === activeJob.id) : ''),
        [activeJob, incomeCategories, jobs]
    );

    const paycheckTx = useMemo(
        () =>
            effectiveCategory
                ? transactions.filter((t) => t.type === 'income' && t.category === effectiveCategory)
                : [],
        [transactions, effectiveCategory]
    );

    const plannedSalary = activeJob?.plannedSalary ?? 0;
    const hourlyRate = activeJob?.hourlyRate ?? 0;
    const commissionPct = activeJob?.commissionPct ?? 0;
    const salesLabel = activeJob?.salesLabel?.trim() || 'Sales';
    const overtime = useMemo(() => activeJob?.overtime ?? [], [activeJob]);
    const sales = useMemo(() => activeJob?.sales ?? [], [activeJob]);

    const usesOvertime = hourlyRate > 0 || overtime.length > 0;
    const usesCommission = commissionPct > 0 || sales.length > 0;

    // All relevant work-months, filled so skipped months show as gaps. Payments
    // are grouped by work-month (see workMonthOf); overtime and sales live in
    // the month they were worked / earned.
    const allMonths = useMemo(() => {
        const keys = new Set<string>();
        paycheckTx.forEach((t) => keys.add(workMonthOf(t)));
        overtime.forEach((o) => keys.add(o.monthKey));
        sales.forEach((s) => keys.add(s.monthKey));
        keys.add(currentKey);

        const sorted = Array.from(keys).sort();
        let [y, m] = sorted[0].split('-').map(Number);
        const [ey, em] = sorted[sorted.length - 1].split('-').map(Number);
        const filled = new Set(keys);
        while (y < ey || (y === ey && m <= em)) {
            filled.add(`${y}-${String(m).padStart(2, '0')}`);
            m += 1;
            if (m > 12) {
                m = 1;
                y += 1;
            }
        }
        return filled;
    }, [paycheckTx, overtime, sales, currentKey]);

    const availableYears = useMemo(() => {
        const ys = new Set<string>();
        allMonths.forEach((k) => ys.add(k.slice(0, 4)));
        return Array.from(ys).sort().reverse();
    }, [allMonths]);

    const currentYear = String(new Date().getFullYear());
    const activeYear =
        selectedYear && (selectedYear === 'all' || availableYears.includes(selectedYear))
            ? selectedYear
            : availableYears.includes(currentYear)
            ? currentYear
            : availableYears[0] ?? currentYear;
    const isAllYears = activeYear === 'all';
    const yearLabel = isAllYears ? 'all years' : activeYear;

    const monthsForYear = useMemo(
        () =>
            Array.from(allMonths)
                .filter((k) => isAllYears || k.startsWith(activeYear))
                .sort()
                .reverse(),
        [allMonths, activeYear, isAllYears]
    );

    // Months the user can log overtime against (worked months, up to now).
    const workableMonths = useMemo(
        () => Array.from(allMonths).filter((k) => k <= currentKey).sort().reverse(),
        [allMonths, currentKey]
    );

    // Earliest work-month with actual paycheck data — where record-keeping starts.
    const trackingStartMonth = useMemo(() => {
        let min: string | null = null;
        paycheckTx.forEach((t) => {
            const k = workMonthOf(t);
            if (min === null || k < min) min = k;
        });
        return min;
    }, [paycheckTx]);

    // Vacation pay is front-loaded: the month it lands in and the following month
    // (which is reduced) are both "vacation-affected" and roughly cancel, so they
    // are shown for reference but not scored against the plan.
    const vacationMonths = useMemo(() => {
        const affected = new Set<string>();
        paycheckTx.forEach((t) => {
            if (isVacationTag(t)) {
                const m = workMonthOf(t);
                affected.add(m);
                affected.add(addMonths(m, 1));
            }
        });
        return affected;
    }, [paycheckTx]);

    // The earliest month shown in the current view is a boundary period and is
    // excluded from the verdict. Two flavours: the very start of the records
    // ("tracking start"), or a year edge where the advance/final split straddles
    // the boundary ("partial period"). Scoped to the year filter.
    const boundaryMonth = useMemo(
        () => (monthsForYear.length > 0 ? monthsForYear[monthsForYear.length - 1] : null),
        [monthsForYear]
    );

    const getMonthData = useCallback(
        (key: string): MonthData => {
            const ops = paycheckTx
                .filter((t) => workMonthOf(t) === key)
                .sort((a, b) => b.date.localeCompare(a.date) || (a.index ?? 0) - (b.index ?? 0));
            const received = ops.reduce((s, t) => s + Math.abs(t.amount), 0);
            const otEntries = overtime.filter((o) => o.monthKey === key);
            const overtimeValue = otEntries.reduce((s, o) => s + o.hours * (o.rate ?? hourlyRate), 0);
            const salesEntry = sales.find((s) => s.monthKey === key);
            const salesAmount = salesEntry ? salesEntry.amount : null;
            const commissionValue = commissionPct > 0 && salesAmount !== null ? (salesAmount * commissionPct) / 100 : 0;
            const expected = plannedSalary + overtimeValue + commissionValue;
            const diff = received - expected;
            const isCurrent = key === currentKey;
            const isFuture = key > currentKey;
            const isIncomplete = key === boundaryMonth; // boundary month, excluded from the verdict
            const isTrackingStart = isIncomplete && key === trackingStartMonth;
            const isVacation = vacationMonths.has(key);
            // Commission months can't be reconciled until the sales figure is in.
            const needsSales = commissionPct > 0 && salesAmount === null && !isFuture;
            const hasExpectation = plannedSalary > 0 || overtimeValue > 0 || commissionValue > 0;
            return {
                key,
                ops,
                received,
                otEntries,
                overtimeValue,
                salesAmount,
                commissionValue,
                expected,
                diff,
                isCurrent,
                isFuture,
                isIncomplete,
                isTrackingStart,
                isVacation,
                needsSales,
                hasExpectation,
            };
        },
        [
            paycheckTx,
            overtime,
            sales,
            hourlyRate,
            plannedSalary,
            commissionPct,
            currentKey,
            boundaryMonth,
            trackingStartMonth,
            vacationMonths,
        ]
    );

    // ---- summary metrics (scoped to the selected year) ----
    const summary = useMemo(() => {
        // Reconcile every completed month except the boundary period and months
        // whose sales figure is still missing. Vacation months are counted too:
        // the front-loaded month and the reduced one that follows even out in
        // the running total, which is what the verdict is measuring.
        const scorable = (d: MonthData) => !d.isIncomplete && !d.needsSales;

        const completedAllMonths = monthsForYear.filter((k) => k < currentKey).map((k) => getMonthData(k));

        const completed = completedAllMonths.filter((d) => scorable(d) && d.received > 0);

        const avgReceived =
            completed.length > 0
                ? completed.reduce((s, d) => s + d.received, 0) / completed.length
                : 0;

        const receivedYear = paycheckTx
            .filter((t) => isAllYears || workMonthOf(t).startsWith(activeYear))
            .reduce((s, t) => s + Math.abs(t.amount), 0);

        // Cumulative reconciliation over full completed months (a skipped month =
        // underpayment). This is the headline "am I underpaid" number.
        const completedAll = completedAllMonths.filter(scorable);
        const totalExpected = completedAll.reduce((s, d) => s + d.expected, 0);
        const totalReceived = completedAll.reduce((s, d) => s + d.received, 0);
        const netDiff = totalReceived - totalExpected;
        // A small residual is timing noise (advance vs final split), not real under/overpay.
        const tolerance = Math.max(1, totalExpected * 0.005);

        // Completed months held back only because their sales figure is missing.
        const pendingSales = completedAllMonths.filter((d) => d.needsSales && !d.isIncomplete).length;

        const last = completed[0]; // completed is newest-first
        const lastDiff = last ? last.diff : 0;
        const lastKey = last ? last.key : null;

        return {
            avgReceived,
            receivedYear,
            lastDiff,
            lastKey,
            completedCount: completed.length,
            totalExpected,
            totalReceived,
            netDiff,
            tolerance,
            talliedCount: completedAll.length,
            pendingSales,
        };
    }, [monthsForYear, getMonthData, currentKey, paycheckTx, activeYear, isAllYears]);

    const formatCurrency = (val: number) => {
        if (isPrivacyMode) return '••••••';
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0,
        }).format(val);
    };

    // ---- overtime / sales mutations ----
    const addOvertime = (entry: OvertimeEntry) => {
        if (!activeJob) return;
        patchJob(activeJob.id, { category: effectiveCategory, overtime: [...overtime, entry] });
    };
    const removeOvertime = (id: string) => {
        if (!activeJob) return;
        patchJob(activeJob.id, { overtime: overtime.filter((o) => o.id !== id) });
    };
    // One figure per month: null clears it (back to "not filled in"), 0 is a real
    // "no sales this month" and still counts as reconcilable.
    const setSalesFor = (monthKey: string, amount: number | null) => {
        if (!activeJob) return;
        const rest = sales.filter((s) => s.monthKey !== monthKey);
        patchJob(activeJob.id, {
            category: effectiveCategory,
            sales: amount === null ? rest : [...rest, { monthKey, amount }],
        });
    };

    const hasData = paycheckTx.length > 0 || incomeCategories.length > 0;

    if (!activeJob) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Paycheck</h2>
                    <p className="text-gray-500">Check whether you're paid what you're owed</p>
                </div>
                <div className="flex items-center gap-2">
                    {availableYears.length > 0 && (
                        <div className="relative group">
                            <select
                                value={activeYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs md:text-sm font-medium text-gray-700 hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                                title="Year"
                            >
                                <option value="all">All years</option>
                                {availableYears.map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none group-hover:text-emerald-500" />
                        </div>
                    )}
                    {incomeCategories.length > 0 && (
                        <div className="relative group">
                            <select
                                value={effectiveCategory}
                                onChange={(e) => patchJob(activeJob.id, { category: e.target.value })}
                                className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs md:text-sm font-medium text-gray-700 hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer shadow-sm"
                                title={`Paycheck source for ${activeJob.name}`}
                            >
                                {!effectiveCategory && <option value="">Source not set</option>}
                                {incomeCategories.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none group-hover:text-emerald-500" />
                        </div>
                    )}
                </div>
            </div>

            {/* Job tabs — each employer is reconciled on its own */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {jobs.map((j) => (
                    <button
                        key={j.id}
                        onClick={() => selectJob(j.id)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all active:scale-95',
                            j.id === activeJob.id
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-gray-900'
                        )}
                    >
                        <Briefcase className="w-3.5 h-3.5" />
                        {j.name || 'Untitled'}
                    </button>
                ))}
                <button
                    onClick={() => setEditingJob((v) => !v)}
                    title="Job settings"
                    className={cn(
                        'p-2 rounded-lg border border-gray-200 bg-white transition-colors',
                        editingJob ? 'text-emerald-600 border-emerald-300' : 'text-gray-400 hover:text-emerald-600'
                    )}
                >
                    <Pencil className="w-4 h-4" />
                </button>
            </div>

            {editingJob && (
                <JobEditor
                    key={activeJob.id}
                    job={activeJob}
                    onChange={(patch) => patchJob(activeJob.id, patch)}
                    onClose={() => setEditingJob(false)}
                />
            )}

            {/* Plan config */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <PlanInput
                    label="Planned salary"
                    hint="What you should be paid per month (net)"
                    icon={<Wallet className="w-5 h-5 text-emerald-500" />}
                    value={activeJob.plannedSalary}
                    suffix="₽/mo"
                    onSave={(v) => patchJob(activeJob.id, { category: effectiveCategory, plannedSalary: v })}
                />
                <PlanInput
                    label="Overtime rate"
                    hint="Pay per hour of overtime · 0 if none"
                    icon={<Clock className="w-5 h-5 text-blue-500" />}
                    value={activeJob.hourlyRate ?? 0}
                    suffix="₽/hr"
                    onSave={(v) => patchJob(activeJob.id, { category: effectiveCategory, hourlyRate: v })}
                />
                <PlanInput
                    label="Sales commission"
                    hint={`Share of ${salesLabel.toLowerCase()} paid on top · 0 if none`}
                    icon={<Percent className="w-5 h-5 text-amber-500" />}
                    value={activeJob.commissionPct ?? 0}
                    suffix="% /mo"
                    onSave={(v) => patchJob(activeJob.id, { category: effectiveCategory, commissionPct: v })}
                />
            </div>

            {!effectiveCategory && incomeCategories.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-3 text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    No income category matches {activeJob.name}. Pick this job's paycheck source in the selector above —
                    until then there's nothing to compare the plan against.
                </div>
            )}

            {/* Verdict banner — the headline "am I underpaid?" answer */}
            {plannedSalary > 0 ? (
                (() => {
                    const under = summary.netDiff < -summary.tolerance;
                    const over = summary.netDiff > summary.tolerance;
                    const sign = under ? '−' : over ? '+' : '';
                    return (
                        <div
                            className={cn(
                                'rounded-xl border p-5 flex items-start sm:items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500',
                                under
                                    ? 'bg-red-50 border-red-200'
                                    : over
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-emerald-50 border-emerald-200'
                            )}
                        >
                            <div
                                className={cn(
                                    'p-3 rounded-xl shrink-0',
                                    under
                                        ? 'bg-red-100 text-red-600'
                                        : over
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'bg-emerald-100 text-emerald-600'
                                )}
                            >
                                {under ? (
                                    <AlertTriangle className="w-7 h-7" />
                                ) : over ? (
                                    <TrendingUp className="w-7 h-7" />
                                ) : (
                                    <CheckCircle2 className="w-7 h-7" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div
                                    className={cn(
                                        'text-sm font-semibold',
                                        under ? 'text-red-700' : over ? 'text-blue-700' : 'text-emerald-700'
                                    )}
                                >
                                    {activeJob.name} ·{' '}
                                    {under ? "you're underpaid" : over ? "you're overpaid" : 'payments on track'}
                                </div>
                                <div className="text-3xl font-bold text-gray-900 mt-0.5">
                                    {isPrivacyMode ? '••••••' : `${sign}${formatCurrency(Math.abs(summary.netDiff))}`}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {summary.talliedCount > 0
                                        ? `Over ${summary.talliedCount} completed mo. (${yearLabel}) · expected ${formatCurrency(
                                              summary.totalExpected
                                          )}, received ${formatCurrency(summary.totalReceived)}`
                                        : `No completed months in ${yearLabel}`}
                                    {summary.pendingSales > 0 &&
                                        ` · ${summary.pendingSales} mo. skipped, ${salesLabel.toLowerCase()} not filled in`}
                                </div>
                            </div>
                        </div>
                    );
                })()
            ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-3 text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    Set your planned salary above — then you'll see the bottom line: whether you're underpaid or not.
                </div>
            )}

            {/* Summary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <MetricCard
                    title="Planned salary"
                    amount={plannedSalary}
                    icon={<Wallet className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />}
                    description={usesCommission ? `Per month, before ${commissionPct}% commission` : 'Expected amount per month'}
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Average received"
                    amount={summary.avgReceived}
                    icon={<Banknote className="w-10 h-10 text-teal-500" strokeWidth={1.5} />}
                    description={`${yearLabel} · ${summary.completedCount} completed mo.`}
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Last month gap"
                    amount={summary.lastDiff}
                    icon={
                        summary.lastDiff >= 0 ? (
                            <TrendingUp className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />
                        ) : (
                            <TrendingDown className="w-10 h-10 text-red-500" strokeWidth={1.5} />
                        )
                    }
                    trend={
                        summary.lastKey
                            ? isPrivacyMode
                                ? '•••'
                                : `${summary.lastDiff >= 0 ? 'Overpaid' : 'Underpaid'} · ${monthLabel(summary.lastKey)}`
                            : undefined
                    }
                    trendColor={summary.lastDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Received"
                    amount={summary.receivedYear}
                    icon={<HandCoins className="w-10 h-10 text-amber-500" strokeWidth={1.5} />}
                    description={`${yearLabel} · total`}
                    isPrivacy={isPrivacyMode}
                />
            </div>

            {/* Monthly breakdown */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                    <h3 className="text-lg font-semibold text-gray-800">By month</h3>
                    {usesOvertime && (
                        <button
                            onClick={() => setShowAddOt((v) => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            Overtime
                        </button>
                    )}
                </div>

                {showAddOt && usesOvertime && (
                    <AddOvertimeForm
                        months={workableMonths.map((k) => ({ key: k, label: monthLabel(k) }))}
                        defaultRate={hourlyRate}
                        onAdd={(entry) => {
                            addOvertime(entry);
                            setShowAddOt(false);
                        }}
                        onCancel={() => setShowAddOt(false)}
                    />
                )}

                {!hasData && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
                        No income data. Upload a statement to track your paycheck.
                    </div>
                )}

                {hasData && monthsForYear.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
                        No data for {activeYear}.
                    </div>
                )}

                {hasData &&
                    monthsForYear.map((key) => (
                        <MonthCard
                            key={`${activeJob.id}:${key}`}
                            data={getMonthData(key)}
                            plannedSalary={plannedSalary}
                            hourlyRate={hourlyRate}
                            usesOvertime={usesOvertime}
                            commissionPct={commissionPct}
                            salesLabel={salesLabel}
                            formatCurrency={formatCurrency}
                            isPrivacy={isPrivacyMode}
                            defaultExpanded={key === monthsForYear[0]}
                            onRemoveOvertime={removeOvertime}
                            onSetSales={setSalesFor}
                        />
                    ))}
            </div>
        </div>
    );
};

// ---- job editor -------------------------------------------------------------

const JobEditor: React.FC<{
    job: PaycheckJob;
    onChange: (patch: Partial<PaycheckJob>) => void;
    onClose: () => void;
}> = ({ job, onChange, onClose }) => {
    // Remounted per job (keyed by id), so the drafts start from the active job.
    const [name, setName] = useState(job.name);
    const [salesLabel, setSalesLabel] = useState(job.salesLabel ?? '');

    return (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                Job settings
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                    <span className="text-xs text-gray-400">Name</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => name.trim() && name.trim() !== job.name && onChange({ name: name.trim() })}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        placeholder="Employer"
                        className="w-full mt-0.5 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-gray-400">Commission base</span>
                    <input
                        type="text"
                        value={salesLabel}
                        onChange={(e) => setSalesLabel(e.target.value)}
                        onBlur={() =>
                            salesLabel.trim() !== (job.salesLabel ?? '') &&
                            onChange({ salesLabel: salesLabel.trim() || undefined })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        placeholder="Ozon sales"
                        className="w-full mt-0.5 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                </label>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                    Naming the job like its income category lets it pick up payments automatically.
                </span>
                <button
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                    Done
                </button>
            </div>
        </div>
    );
};

// ---- editable plan input ----------------------------------------------------

const PlanInput: React.FC<{
    label: string;
    hint: string;
    icon: React.ReactNode;
    value?: number;
    suffix: string;
    onSave: (v: number) => void;
}> = ({ label, hint, icon, value, suffix, onSave }) => {
    const [draft, setDraft] = useState(value !== undefined && value !== null ? String(value) : '');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setDraft(value !== undefined && value !== null ? String(value) : '');
    }, [value]);

    const commit = () => {
        const parsed = parseFloat(draft.replace(',', '.'));
        const next = isNaN(parsed) ? 0 : Math.max(0, parsed);
        if (next !== (value ?? 0)) {
            onSave(next);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1500);
        }
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        {label}
                        {saved && (
                            <span className="text-emerald-600 flex items-center gap-0.5 text-xs animate-in fade-in">
                                <Check className="w-3 h-3" /> saved
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{hint}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="0"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap w-14">{suffix}</span>
            </div>
        </div>
    );
};

// ---- month card -------------------------------------------------------------

interface MonthData {
    key: string;
    ops: Transaction[];
    received: number;
    otEntries: OvertimeEntry[];
    overtimeValue: number;
    salesAmount: number | null; // null = not filled in yet
    commissionValue: number;
    expected: number;
    diff: number;
    isCurrent: boolean;
    isFuture: boolean;
    isIncomplete: boolean; // boundary month — excluded from the verdict
    isTrackingStart: boolean; // boundary is the very start of the records (vs a year edge)
    isVacation: boolean; // vacation-affected — shown for reference, not scored
    needsSales: boolean; // commission job with no sales figure — can't be scored yet
    hasExpectation: boolean;
}

const MonthCard: React.FC<{
    data: MonthData;
    plannedSalary: number;
    hourlyRate: number;
    usesOvertime: boolean;
    commissionPct: number;
    salesLabel: string;
    formatCurrency: (v: number) => string;
    isPrivacy: boolean;
    defaultExpanded: boolean;
    onRemoveOvertime: (id: string) => void;
    onSetSales: (monthKey: string, amount: number | null) => void;
}> = ({
    data,
    plannedSalary,
    hourlyRate,
    usesOvertime,
    commissionPct,
    salesLabel,
    formatCurrency,
    isPrivacy,
    defaultExpanded,
    onRemoveOvertime,
    onSetSales,
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    const {
        key,
        ops,
        received,
        otEntries,
        overtimeValue,
        salesAmount,
        commissionValue,
        expected,
        diff,
        isCurrent,
        isFuture,
        isIncomplete,
        isTrackingStart,
        isVacation,
        needsSales,
        hasExpectation,
    } = data;

    // A month is "scored" (compared to the plan) only when it's a normal completed month.
    const scored = !isIncomplete && !isFuture && !isCurrent && !needsSales;
    const showCommission = commissionPct > 0 || salesAmount !== null;

    // Status chip
    let status: { label: string; cls: string; icon: React.ReactNode } | null = null;
    if (isIncomplete) {
        status = {
            label: isTrackingStart ? 'Tracking start' : 'Partial period',
            cls: 'bg-amber-50 text-amber-600',
            icon: <CalendarClock className="w-3.5 h-3.5" />,
        };
    } else if (isFuture) {
        status = hasExpectation
            ? {
                  label: 'Expected',
                  cls: 'bg-blue-50 text-blue-600',
                  icon: <CalendarClock className="w-3.5 h-3.5" />,
              }
            : null;
    } else if (needsSales) {
        status = {
            label: `Add ${salesLabel.toLowerCase()}`,
            cls: 'bg-amber-100 text-amber-700',
            icon: <ShoppingBag className="w-3.5 h-3.5" />,
        };
    } else if (isCurrent) {
        status = {
            label: 'Current month',
            cls: 'bg-gray-100 text-gray-500',
            icon: <CalendarClock className="w-3.5 h-3.5" />,
        };
    } else if (hasExpectation) {
        if (received === 0) {
            status = {
                label: 'Not paid',
                cls: 'bg-red-100 text-red-700',
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
            };
        } else if (diff < -1) {
            status = {
                label: 'Underpaid',
                cls: 'bg-red-100 text-red-700',
                icon: <TrendingDown className="w-3.5 h-3.5" />,
            };
        } else if (diff > 1) {
            status = {
                label: 'Overpaid',
                cls: 'bg-blue-100 text-blue-700',
                icon: <TrendingUp className="w-3.5 h-3.5" />,
            };
        } else {
            status = {
                label: 'On track',
                cls: 'bg-emerald-100 text-emerald-700',
                icon: <Check className="w-3.5 h-3.5" />,
            };
        }
    }

    const pct = expected > 0 ? Math.min((received / expected) * 100, 100) : received > 0 ? 100 : 0;
    const diffPositive = diff >= 0;

    // Plan / [Overtime] / [Commission] / Expected / Received
    const breakdown: { label: string; value: number; strong?: boolean }[] = [
        { label: 'Plan', value: plannedSalary },
        ...(usesOvertime ? [{ label: 'Overtime', value: overtimeValue }] : []),
        ...(showCommission ? [{ label: `${commissionPct}% commission`, value: commissionValue }] : []),
        { label: 'Expected', value: expected, strong: true },
        { label: 'Received', value: received, strong: true },
    ];
    const breakdownCols =
        ({ 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5' } as Record<number, string>)[
            breakdown.length
        ] ?? 'sm:grid-cols-4';

    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header row */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-gray-50/60 transition-colors text-left"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown
                        className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', expanded && 'rotate-180')}
                    />
                    <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{monthLabel(key)}</div>
                        <div className="text-xs text-gray-400">
                            {ops.length} {ops.length === 1 ? 'payment' : 'payments'}
                            {overtimeValue > 0 && ' · with overtime'}
                            {commissionValue > 0 && ' · with commission'}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {status && (
                        <span
                            className={cn(
                                'hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
                                status.cls
                            )}
                        >
                            {status.icon}
                            {status.label}
                        </span>
                    )}
                    <div className="text-right">
                        <div className="font-bold text-gray-900">{formatCurrency(received)}</div>
                        {hasExpectation && scored && (
                            <div
                                className={cn(
                                    'text-xs font-medium',
                                    diffPositive ? 'text-emerald-600' : 'text-red-500'
                                )}
                            >
                                {isPrivacy ? '•••' : `${diffPositive ? '+' : ''}${formatCurrency(diff)}`}
                            </div>
                        )}
                    </div>
                </div>
            </button>

            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-50 animate-in fade-in slide-in-from-top-1">
                    {isIncomplete && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                {isTrackingStart
                                    ? "Tracking starts here — this month's data is partial, so it isn't compared to the plan or counted in the total."
                                    : 'First month of the period — payments shift around the boundary (advance and final settlement land in different months), so the figure is partial. It isn\'t compared to the plan or counted in the total.'}
                            </span>
                        </div>
                    )}

                    {isVacation && !isIncomplete && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg p-3">
                            <Umbrella className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Vacation-affected — vacation pay comes up front and the next month is reduced, so this
                                month can look off on its own. It is counted anyway: the pair evens out in the total.
                            </span>
                        </div>
                    )}

                    {needsSales && !isIncomplete && !isVacation && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <ShoppingBag className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Enter {salesLabel.toLowerCase()} for this month below — without them the {commissionPct}%
                                commission is unknown, so the month isn't compared to the plan.
                            </span>
                        </div>
                    )}

                    {/* Expected vs received */}
                    {hasExpectation && scored && (
                        <div className={cn('mt-4 grid grid-cols-2 gap-3 text-sm', breakdownCols)}>
                            {breakdown.map((cell) => (
                                <div key={cell.label}>
                                    <div className="text-xs text-gray-400">{cell.label}</div>
                                    <div
                                        className={cn(
                                            cell.strong ? 'text-gray-900' : 'text-gray-700',
                                            cell.label === 'Received' ? 'font-bold' : 'font-medium'
                                        )}
                                    >
                                        {formatCurrency(cell.value)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {hasExpectation && scored && (
                        <div className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all duration-500',
                                    diff < -1 || received === 0 ? 'bg-red-400' : 'bg-emerald-500'
                                )}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    )}

                    {/* Payments */}
                    <div className="mt-4">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Payments
                        </div>
                        {ops.length === 0 ? (
                            <div className="text-sm text-gray-400 italic py-2">No payments for this month</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {ops.map((t) => {
                                    const tag = (t.tags && t.tags.length > 0 ? t.tags.join(', ') : t.note) || '';
                                    return (
                                        <div key={t.id} className="flex items-center justify-between py-2 gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-xs text-gray-400 w-14 shrink-0 whitespace-nowrap">
                                                    {shortDate(t.date)}
                                                </span>
                                                {tag && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 truncate">
                                                        {tag}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="font-medium text-gray-900 shrink-0">
                                                {formatCurrency(Math.abs(t.amount))}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Sales this month → commission */}
                    {showCommission && (
                        <SalesRow
                            monthKey={key}
                            label={salesLabel}
                            amount={salesAmount}
                            commissionPct={commissionPct}
                            commissionValue={commissionValue}
                            formatCurrency={formatCurrency}
                            onSave={onSetSales}
                        />
                    )}

                    {/* Overtime worked this month */}
                    {usesOvertime && (
                        <div className="mt-4">
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                Overtime
                            </div>

                            {otEntries.length > 0 && (
                                <div className="divide-y divide-gray-50 mb-2">
                                    {otEntries.map((o) => {
                                        const rate = o.rate ?? hourlyRate;
                                        return (
                                            <div key={o.id} className="flex items-center justify-between py-2 gap-3">
                                                <div className="flex items-center gap-2 min-w-0 text-sm">
                                                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                    <span className="text-gray-700">
                                                        {o.hours} h × {formatCurrency(rate)}
                                                    </span>
                                                    {o.note && (
                                                        <span className="text-xs text-gray-400 truncate">· {o.note}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="font-medium text-gray-900">
                                                        {formatCurrency(o.hours * rate)}
                                                    </span>
                                                    <button
                                                        onClick={() => onRemoveOvertime(o.id)}
                                                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {otEntries.length === 0 && (
                                <div className="text-sm text-gray-400 italic py-1">
                                    No overtime for {monthLabel(key)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ---- monthly sales (commission base) ----------------------------------------

const SalesRow: React.FC<{
    monthKey: string;
    label: string;
    amount: number | null;
    commissionPct: number;
    commissionValue: number;
    formatCurrency: (v: number) => string;
    onSave: (monthKey: string, amount: number | null) => void;
}> = ({ monthKey, label, amount, commissionPct, commissionValue, formatCurrency, onSave }) => {
    const [draft, setDraft] = useState(amount === null ? '' : String(amount));
    const [saved, setSaved] = useState(false);

    // Follow the stored figure when it changes underneath us (settings synced
    // from another device), without stomping on what is being typed.
    const [synced, setSynced] = useState(amount);
    if (amount !== synced) {
        setSynced(amount);
        setDraft(amount === null ? '' : String(amount));
    }

    const commit = () => {
        const trimmed = draft.trim();
        const parsed = parseFloat(trimmed.replace(/\s/g, '').replace(',', '.'));
        const next = trimmed === '' || isNaN(parsed) ? null : Math.max(0, parsed);
        if (next !== amount) {
            onSave(monthKey, next);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1500);
        }
    };

    return (
        <div className="mt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                {label}
                {saved && (
                    <span className="text-emerald-600 flex items-center gap-0.5 normal-case tracking-normal animate-in fade-in">
                        <Check className="w-3 h-3" /> saved
                    </span>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <ShoppingBag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400" />
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        placeholder="Amount for the month"
                        className="w-52 pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                </div>
                <span className="text-sm text-gray-400">× {commissionPct}% =</span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(commissionValue)}</span>
                {amount !== null && (
                    <button
                        onClick={() => onSave(monthKey, null)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        title="Clear"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
                {label} for {monthLabel(monthKey)} — {commissionPct}% of it is expected on top of the salary. Enter 0 if
                there were none.
            </p>
        </div>
    );
};

// ---- overtime add form (global, with month picker) --------------------------

const AddOvertimeForm: React.FC<{
    months: { key: string; label: string }[];
    defaultRate: number;
    onAdd: (entry: OvertimeEntry) => void;
    onCancel: () => void;
}> = ({ months, defaultRate, onAdd, onCancel }) => {
    const [monthKey, setMonthKey] = useState(months[0]?.key ?? ymKey(new Date()));
    const [hours, setHours] = useState('');
    const [rate, setRate] = useState(defaultRate ? String(defaultRate) : '');
    const [note, setNote] = useState('');
    const [error, setError] = useState(false);

    const submit = () => {
        const h = parseFloat(hours.replace(',', '.'));
        if (isNaN(h) || h <= 0) {
            setError(true);
            return;
        }
        const r = parseFloat(rate.replace(',', '.'));
        onAdd({
            id: uid(),
            monthKey,
            hours: h,
            rate: isNaN(r) ? undefined : r,
            note: note.trim() || undefined,
        });
    };

    const monthOptions =
        months.length > 0 ? months : [{ key: ymKey(new Date()), label: monthLabel(ymKey(new Date())) }];

    return (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Clock className="w-4 h-4 text-blue-500" />
                New overtime
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block">
                    <span className="text-xs text-gray-400">Month worked</span>
                    <div className="relative mt-0.5">
                        <select
                            value={monthKey}
                            onChange={(e) => setMonthKey(e.target.value)}
                            className="appearance-none w-full px-2.5 py-2 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none cursor-pointer"
                        >
                            {monthOptions.map((m) => (
                                <option key={m.key} value={m.key}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                </label>
                <label className="block">
                    <span className="text-xs text-gray-400">Hours</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        autoFocus
                        value={hours}
                        onChange={(e) => {
                            setHours(e.target.value);
                            if (error) setError(false);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder="8"
                        className={cn(
                            'w-full mt-0.5 px-2.5 py-2 bg-gray-50 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
                            error ? 'border-red-300' : 'border-gray-200'
                        )}
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-gray-400">Rate, ₽/hr</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder={defaultRate ? String(defaultRate) : '0'}
                        className="w-full mt-0.5 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                </label>
            </div>

            <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Task / note (optional)"
                className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />

            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                    {(() => {
                        const h = parseFloat(hours.replace(',', '.'));
                        const r = parseFloat(rate.replace(',', '.'));
                        if (isNaN(h) || h <= 0) return 'Enter hours';
                        const val = h * (isNaN(r) ? 0 : r);
                        const total = new Intl.NumberFormat('ru-RU', {
                            style: 'currency',
                            currency: 'RUB',
                            maximumFractionDigits: 0,
                        }).format(val);
                        return `Total: ${total}`;
                    })()}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        className="px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
};
