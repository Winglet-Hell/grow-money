import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { formatDate } from '../lib/utils';
import { detectRecurring } from '../lib/recurring';

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

// One line on the dashboard: how much the recurring payments add up to and what's next.
export function RecurringStrip({ transactions }: { transactions: Transaction[] }) {
    const { isPrivacyMode } = usePrivacy();
    const { settings } = useUserSettings();
    const hiddenIds = settings.preferences.recurring?.hiddenIds;

    const summary = useMemo(() => detectRecurring(transactions, { hiddenIds }), [transactions, hiddenIds]);

    if (summary.active.length === 0 && summary.missed.length === 0) return null;

    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(n));
    const next = summary.upcoming[0];

    return (
        <Link
            to="/recurring"
            className="group flex items-center gap-3 sm:gap-4 bg-white rounded-xl shadow-sm border border-gray-100 px-4 sm:px-5 py-3 hover:shadow-md hover:border-emerald-100 transition-all -mt-2"
        >
            <div className="p-2 rounded-lg bg-violet-50 text-violet-600 shrink-0">
                <Repeat className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <span className="font-semibold text-gray-900">Recurring</span>
                <span className="text-gray-600">
                    {summary.active.length} active · ≈ {money(summary.monthlyRub)}/mo
                </span>
                {next && (
                    <span className="text-gray-500 truncate">
                        next: <span className="text-gray-800">{next.name}</span> {formatDate(next.nextDate).slice(0, 5)}
                    </span>
                )}
                {summary.missed.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {summary.missed.length} not seen
                    </span>
                )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 shrink-0 transition-colors" />
        </Link>
    );
}
