import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
    Download,
    Copy,
    CheckCircle,
    FileJson,
    Bot,
    Eye,
    Repeat,
    ArrowRightLeft,
    Wallet,
    AlertTriangle,
    Layers,
    TrendingUp,
    CalendarDays,
    Target,
} from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { useAccounts } from '../hooks/useAccounts';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { useHistoricalRates } from '../hooks/useHistoricalRates';
import { buildAIExportPayload, toPrettyJson } from '../lib/aiExport';
import { formatCurrencyAmount } from '../lib/currencies';
import { referenceCoverage } from '../lib/fxBenchmark';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

interface AIExportPageProps {
    transactions: Transaction[];
}

const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Trips live in Dexie when signed out and in Supabase when signed in — same
// resolution order the Travel pages use.
function useTrips() {
    const [trips, setTrips] = useState<Trip[]>([]);

    useEffect(() => {
        let cancelled = false;

        const loadLocal = async () => {
            const local = await db.trips.toArray();
            if (!cancelled) setTrips(local);
        };

        const loadCloud = async (userId: string) => {
            const { data } = await supabase.from('trips').select('*').eq('user_id', userId);
            if (cancelled || !data) return;
            setTrips(
                data.map(t => ({
                    id: t.id,
                    name: t.name,
                    startDate: t.start_date,
                    endDate: t.end_date,
                    excludedTransactionIds: t.excluded_transaction_ids || [],
                    additionalTransactionIds: t.additional_transaction_ids || [],
                    transactionSnapshots: t.transaction_snapshots || {},
                }))
            );
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) loadCloud(session.user.id);
            else loadLocal();
        });

        return () => {
            cancelled = true;
        };
    }, []);

    return trips;
}

export function AIExportPage({ transactions }: AIExportPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { settings } = useUserSettings();
    const { accounts, totalNetWorth, rates, isLiveRates } = useAccounts(transactions);
    const { limits: categoryLimits } = useCategoryLimits();
    const recurringHiddenIds = settings.preferences.recurring?.hiddenIds;
    const trips = useTrips();

    // Market rates for the day of every conversion, so the export can say what each
    // exchange cost against the market (fx.marketBenchmark). Cached after the first load.
    const coverage = useMemo(() => referenceCoverage(transactions), [transactions]);
    const referenceRates = useHistoricalRates(coverage.dates, coverage.codes);

    const [isCopied, setIsCopied] = useState(false);
    const [isPromptCopied, setIsPromptCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const dataPayload = useMemo(
        () =>
            buildAIExportPayload({
                transactions,
                accounts: accounts.map(a => ({
                    name: a.name,
                    type: a.type,
                    currency: a.currency,
                    balance: a.current,
                    rubEquivalent: a.rubEquivalent,
                    balanceDate: a.balance_date,
                    operationsSinceBalance: a.txSinceBalance,
                    lastActivity: a.lastActivity,
                })),
                netWorth: totalNetWorth,
                liveRates: { rates, date: null, isLive: isLiveRates },
                referenceRates,
                trips,
                paycheck: settings.preferences.paycheck,
                categoryLimits,
                recurringHiddenIds,
            }),
        [transactions, accounts, totalNetWorth, rates, isLiveRates, referenceRates, trips, settings.preferences.paycheck, categoryLimits, recurringHiddenIds]
    );

    const json = useMemo(() => toPrettyJson(dataPayload), [dataPayload]);
    const fileSizeKb = useMemo(() => Math.round(new Blob([json]).size / 1024), [json]);

    const money = (n: number | null | undefined, sign = '') =>
        isPrivacyMode || n === null || n === undefined ? '•••' : sign + Math.round(n).toLocaleString('ru-RU');

    // Balances shown in their own currency, where rounding to whole units would turn a
    // real crypto holding into "0".
    const nativeMoney = (n: number | null | undefined, currency: string) =>
        isPrivacyMode || n === null || n === undefined ? '•••' : formatCurrencyAmount(n, currency);

    const handleDownload = () => {
        setIsDownloading(true);
        setTimeout(() => {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `grow_money_data_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setIsDownloading(false);
        }, 400);
    };

    const handleCopyJson = async () => {
        try {
            await navigator.clipboard.writeText(json);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
        }
    };

    const instructionText = `Роль: ты — мой личный финансовый аналитик. Говори прямо, без смягчений, но простым языком: я не финансист. Никакой «воды», банальностей и мотивационных советов.

Данные:
В прикреплённом JSON — полная история моих операций и уже посчитанная по ней аналитика. Мой профиль (город, виза, работа, привычки, валюты) — в блоке profile. Базовая валюта — рубли (meta.baseCurrency).
Сначала прочитай meta.readMeFirst и поля note внутри блоков: там единицы измерения, знаки и подводные камни конкретных полей. Они важнее твоих предположений о том, как обычно устроены такие файлы.
Блоки ledger и transferLedger в конце — сырые строки (формат колонок в meta.schema). Они только для проверки: аналитику бери из готовых блоков, а не пересчитывай из сырых данных.

Правила:
1. Каждая цифра — с указанием блока, откуда она взята (например: expenses.byCategory). Готовые агрегаты бери из файла как есть; производные величины (в год, доли, прогноз) считай на их основе и одной фразой показывай, как получил.
2. Ничего не выдумывай. Не хватает данных для вывода — так и напиши.
3. Внешние знания (цены, доходности инструментов, прогнозы курсов) помечай как «внешнее допущение» и не смешивай с фактами из файла.
4. Каждая рекомендация = конкретное действие + эффект в рублях в месяц + на чём основана. Общих советов не надо.
5. Не пересказывай мне мои данные — мне нужны выводы.
6. Не считай одну и ту же трату дважды: категория (expenses.byCategory), магазин (payees.rows) и регулярный платёж (recurring.detected, recurring.rows) — это разные срезы одних и тех же денег.
7. Поездки (trips.rows) и переезд из Паттайи в Бангкок (profile.residence) объясняют всплески расходов — это не утечки.
8. Текущий месяц (currentMonth) не закончен: сравнивай его только с прошлым месяцем на ту же дату (expensesPrevMonthSameDay) или через прогноз (projectedMonthEndExpenses), а не с полными месяцами.

Структура ответа:

1. ВЕРДИКТ. До 7 строк: где я нахожусь, что главное не так, во сколько это обходится мне в год.

2. УТЕЧКИ. Таблица топ-10 по потерям в рублях в год: что | ₽/мес | ₽/год | % от расходов | почему это утечка | что делать. Источники: expenses.byCategory, payees.rows, recurring.detected, recurring.rows, expenses.largest. Подписки, аренда и счета — из recurring.detected (это тот же список, что я вижу в приложении, суммы в валюте платежа + в рублях): кандидаты на отмену — только status "active"; "missed" — платёж ожидался и не пришёл, возможно уже отменено; "ended" и hiddenByUser в текущие расходы не включай. recurring.rows — более широкий срез привычек (такси, продукты), там status "lapsed" тоже значит «уже не платится». Лимиты: budget.rows — мои месячные лимиты по категориям; где monthsOverLimit велик, лимит стабильно не выдерживается — скажи, лимит нереалистичный или трата раздута.

3. СБЕРЕЖЕНИЯ И УСТОЙЧИВОСТЬ. Норма сбережений (savingsRatePct — какая часть дохода остаётся): последние 3 месяца против 6 против всего периода (monthly.averages) и динамика по месяцам (monthly.rows). Зависимость от одного источника дохода (income.concentrationTopSourcePct): что будет, если он пропадёт, и на сколько месяцев хватит остатков на счетах (accounts.rows) при текущих расходах. Фактический доход по работам (income.bySource) против плановой зарплаты (profile.jobs). Валютные риски — expenses.byCurrency, expenses.monthlyByCurrency.

4. КОНВЕРТАЦИИ. Сначала прочитай fx.marketBenchmark.note. Главная цифра — сколько рублей забрали обменники относительно рыночного курса дня: fx.marketBenchmark.totalLostToExchangersInBase и weightedVsMarketPct. По парам — fx.pairs[].lostToExchangerInBase, по площадкам — fx.byRoute (маршрут «счёт → счёт» = где я менял): где теряю больше всего, где выгоднее. Дай правила: что менять через что, какими суммами и сколько это сэкономит в год. Про тайминг (pairs[].spreadPct, conversions[].vsYourAvgPct) — отдельно и коротко: это сравнение меня с самим собой, а не с рынком.

5. ПРОГНОЗ НА 3 МЕСЯЦА. Только по полным месяцам (isPartial = false). Назови метод простыми словами. Два сценария — базовый и пессимистичный — с диапазоном, а не одним числом. Что даёт наибольший разброс (expenses.categoryTrends) и что способно сломать прогноз.

6. КАПИТАЛ. Что делать со свободными деньгами при моей структуре счетов (accounts.rows, summary.netWorthInBase) и моей норме сбережений. Мне интересны крипта, защита от инфляции и автоматизация. Явно отдели то, что следует из моих данных, от общих рекомендаций.

7. КАЧЕСТВО УЧЁТА. По блоку dataQuality: что мешает точной аналитике и что мне начать фиксировать, чтобы через 3 месяца ответы стали точнее. Отсортируй по влиянию на выводы.

Формат:
Простой язык: короткие предложения, без жаргона; если без термина не обойтись — поясни его в скобках при первом упоминании. В каждом разделе первая строка — главный вывод одной фразой, дальше детали. Суммы округляй до тысяч рублей, проценты — до одного знака. Таблицы для сравнений, списки для действий, ключевые цифры жирным. Без вступлений и заключений. Если раздел не подкреплён данными — одна строка почему и переходи дальше.`;

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(instructionText);
            setIsPromptCopied(true);
            setTimeout(() => setIsPromptCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const { meta, dataQuality, summary } = dataPayload;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-xl">
                    <Bot className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">AI Analyst Export</h1>
                    <p className="text-gray-500">Prepare your financial data for deep analysis with ChatGPT or Gemini.</p>
                </div>
            </div>

            {/* Coverage strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Period', value: `${meta.coverage.firstDate ?? '—'} → ${meta.coverage.lastDate ?? '—'}` },
                    { label: 'Records', value: `${meta.coverage.records.total.toLocaleString('ru-RU')} (${meta.coverage.records.transfers} transfers)` },
                    { label: 'Months', value: `${meta.coverage.months} (${meta.coverage.completeMonths} complete)` },
                    { label: 'Payload size', value: `${fileSizeKb} KB` },
                ].map(item => (
                    <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{item.label}</div>
                        <div className="text-sm font-semibold text-gray-900 break-words">{item.value}</div>
                    </div>
                ))}
            </div>

            {referenceRates.isLoading && (
                <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                    <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0 mt-0.5" />
                    <div className="text-sm text-indigo-900">
                        <span className="font-semibold">Loading market rates for your conversion dates.</span>
                        {' '}The fx.marketBenchmark block (what each exchange cost against the market) is incomplete until this finishes — wait a moment before exporting.
                    </div>
                </div>
            )}

            {meta.completeness.lastMonthIsPartial && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">
                        <span className="font-semibold">{meta.completeness.lastMonth} is incomplete</span>
                        {' '}({meta.completeness.lastMonthDaysCovered} of {meta.completeness.lastMonthTotalDays} days).
                        The export flags this so the model excludes it from averages and forecasts instead of reading it as a spending drop.
                    </div>
                </div>
            )}

            {/* Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Step 1: Download Data */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                1
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Download Data File</h2>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleCopyJson}
                                disabled={referenceRates.isLoading}
                                className="p-2 hover:bg-gray-50 rounded-lg transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                                title={referenceRates.isLoading ? 'Waiting for market rates…' : 'Copy JSON to clipboard'}
                            >
                                {isCopied ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-500 transition-all scale-110" />
                                ) : (
                                    <Copy className="w-5 h-5 text-gray-400 group-hover:text-indigo-500" />
                                )}
                            </button>
                            <FileJson className="w-5 h-5 text-gray-400" />
                        </div>
                    </div>

                    <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                        Full history plus pre-computed analytics: monthly series, the running month with its
                        projection, category matrix and your limits, merchants, recurring charges as the Recurring
                        page shows them, FX rates you actually paid and what each exchange cost against the market,
                        wallet balances and a data-quality report.
                    </p>

                    <button
                        onClick={handleDownload}
                        disabled={isDownloading || referenceRates.isLoading}
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow"
                    >
                        {isDownloading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Download className="w-5 h-5" />
                        )}
                        {isDownloading ? 'Generating...' : referenceRates.isLoading ? 'Loading market rates…' : 'Download JSON'}
                    </button>
                </div>

                {/* Step 2: Copy Instructions */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm">
                                2
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Copy Instructions</h2>
                        </div>
                        <button
                            onClick={handleCopyPrompt}
                            className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
                            title="Copy instructions"
                        >
                            {isPromptCopied ? (
                                <CheckCircle className="w-5 h-5 text-emerald-500 transition-all scale-110" />
                            ) : (
                                <Copy className="w-5 h-5 text-gray-400 group-hover:text-indigo-500" />
                            )}
                        </button>
                    </div>

                    <div className="relative group">
                        <textarea
                            readOnly
                            value={instructionText}
                            className="w-full h-32 p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-200 my-8"></div>

            {/* Data Visualization Preview */}
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        <Eye className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Data Payload Preview</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Monthly Stats */}
                    <Card title="Monthly Summary" hint={`${dataPayload.monthly.averages.monthsUsed} complete months`}>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {[...dataPayload.monthly.rows].reverse().map(m => (
                                <div key={m.month} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div>
                                        <span className="font-medium text-gray-700">{m.month}</span>
                                        {m.isPartial && (
                                            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                                                partial
                                            </span>
                                        )}
                                        {m.savingsRatePct !== null && (
                                            <span className="block text-xs text-gray-400">
                                                savings rate {m.savingsRatePct}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-emerald-600 font-medium">{money(m.income, '+')}</div>
                                        <div className="text-red-500 text-xs">{money(m.expenses, '-')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Current month — what the dashboard shows */}
                    <Card
                        icon={<CalendarDays className="w-4 h-4" />}
                        title="This Month"
                        hint={`${dataPayload.currentMonth.month} · day ${dataPayload.currentMonth.dayOfMonth ?? '?'} of ${dataPayload.currentMonth.daysInMonth ?? '?'}`}
                    >
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-sm">
                            {(() => {
                                const cm = dataPayload.currentMonth;
                                const rows: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }[] = [
                                    { label: 'Income to date', value: money(cm.incomeToDate, '+'), sub: cm.incomePrevMonthFull !== null ? `prev month total ${money(cm.incomePrevMonthFull)}` : undefined },
                                    { label: 'Expenses to date', value: money(cm.expensesToDate, '-'), sub: cm.expensesPrevMonthSameDay !== null ? `prev month by the same day ${money(cm.expensesPrevMonthSameDay)}` : undefined, tone: cm.expensesPrevMonthSameDay !== null && cm.expensesToDate > cm.expensesPrevMonthSameDay ? 'warn' : undefined },
                                    { label: 'Saved so far', value: money(cm.netToDate), sub: cm.savingsRateToDatePct !== null ? `savings rate ${cm.savingsRateToDatePct}%` : undefined },
                                    { label: 'Month-end projection', value: cm.projectedMonthEndExpenses !== null ? money(cm.projectedMonthEndExpenses) : '—', sub: cm.projectionBasis === 'history' ? 'spent + what past months spent after this day' : cm.projectionBasis === 'linear' ? 'current daily pace' : undefined, tone: cm.projectedMonthEndExpenses !== null && cm.budgetTotal !== null && cm.projectedMonthEndExpenses > cm.budgetTotal ? 'warn' : 'good' },
                                    { label: 'Budget used', value: cm.budgetUsedPct !== null ? `${cm.budgetUsedPct}%` : 'no limits set', sub: cm.budgetTotal !== null ? `of ${money(cm.budgetTotal)} ${meta.baseCurrency} across limits` : undefined },
                                    { label: 'Avg. complete month', value: money(cm.avgCompleteMonthExpenses, '-'), sub: `income ${money(cm.avgCompleteMonthIncome, '+')}` },
                                ];
                                return rows.map(row => (
                                    <div key={row.label} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                                        <div className="min-w-0">
                                            <span className="text-gray-600">{row.label}</span>
                                            {row.sub && <span className="block text-xs text-gray-400 truncate">{row.sub}</span>}
                                        </div>
                                        <span className={`font-semibold shrink-0 ${row.tone === 'warn' ? 'text-amber-600' : row.tone === 'good' ? 'text-emerald-600' : 'text-gray-900'}`}>{row.value}</span>
                                    </div>
                                ));
                            })()}
                        </div>
                    </Card>

                    {/* Budget limits with their track record */}
                    <Card
                        icon={<Target className="w-4 h-4" />}
                        title="Budget Limits"
                        hint={dataPayload.budget.rows.length
                            ? `${dataPayload.budget.categoriesWithLimit} categories · ${money(dataPayload.budget.monthlyTotal)} ${meta.baseCurrency}/mo`
                            : 'no limits set'}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.budget.rows.map(b => (
                                <div key={b.category} className="p-3 bg-gray-50 rounded-lg text-sm">
                                    <div className="flex items-center justify-between mb-1.5 gap-3">
                                        <span className="font-medium text-gray-700 truncate">{b.category}</span>
                                        <span className="font-semibold text-gray-900 shrink-0">{money(b.spentThisMonth)} / {money(b.monthlyLimit)}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${b.usedThisMonthPct > 100 ? 'bg-rose-500' : b.usedThisMonthPct > 85 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                            style={{ width: `${Math.min(100, b.usedThisMonthPct)}%` }}
                                        />
                                    </div>
                                    <span className="block text-xs text-gray-400 mt-1.5">
                                        {b.usedThisMonthPct}% this month · over limit in {b.monthsOverLimit} of {b.monthsMeasured} months
                                        {b.monthsMeasured > 0 && b.monthsOverLimit / b.monthsMeasured >= 0.5 && (
                                            <span className="text-amber-600 font-medium"> · limit rarely held</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                            {dataPayload.budget.rows.length === 0 && (
                                <p className="text-gray-400 text-sm italic">Set limits on the Expenses page and they will be exported here.</p>
                            )}
                        </div>
                    </Card>

                    {/* Income Sources */}
                    <Card title="Income Sources" hint={`top source ${summary.incomeConcentrationTopSourcePct}%`}>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.income.bySource.map(item => (
                                <div key={item.source} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div>
                                        <span className="font-medium text-gray-700">{item.source}</span>
                                        <span className="block text-xs text-gray-400">
                                            {item.count}× · {item.activeMonths} mo · {item.sharePct}%
                                        </span>
                                    </div>
                                    <span className="font-semibold text-emerald-600">{money(item.amount, '+')}</span>
                                </div>
                            ))}
                            {dataPayload.income.bySource.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No income records found.</p>
                            )}
                        </div>
                    </Card>

                    {/* Expense Categories */}
                    <Card
                        icon={<Layers className="w-4 h-4" />}
                        title="Expense Categories"
                        hint={`${dataPayload.expenses.byCategory.length} specific · ${dataPayload.expenses.byGroup.length} groups`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.expenses.byCategory.map(item => (
                                <div key={item.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">{item.category}</span>
                                        <span className="block text-xs text-gray-400">
                                            {item.group} · {item.count}× · {item.sharePct}%
                                        </span>
                                    </div>
                                    <span className="font-semibold text-gray-900 shrink-0">{money(item.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Currency Exposure */}
                    <Card icon={<TrendingUp className="w-4 h-4" />} title="Currency Exposure" hint="spend by account currency">
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.expenses.byCurrency.map(c => (
                                <div key={c.currency} className="p-3 bg-gray-50 rounded-lg text-sm">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-medium text-gray-700">{c.currency}</span>
                                        <span className="font-semibold text-gray-900">{money(c.amountInBase)}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.sharePct}%` }} />
                                    </div>
                                    <span className="block text-xs text-gray-400 mt-1.5">
                                        {c.sharePct}% · {c.count}× · {money(c.amountNative)} {c.currency}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Top Payees */}
                    <Card title="Top Payees (Tags)" hint={`${dataPayload.payees.listed} of ${dataPayload.payees.uniqueCount} exported`}>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.payees.rows.slice(0, 12).map(item => (
                                <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">{item.name}</span>
                                        <span className="block text-xs text-gray-400">
                                            {item.mainCategory} · avg {money(item.avgTicket)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-gray-500 text-xs">{item.count}x</span>
                                        <span className="font-semibold text-gray-900">{money(item.amount)}</span>
                                    </div>
                                </div>
                            ))}
                            {dataPayload.payees.rows.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No tagged expenses found.</p>
                            )}
                        </div>
                    </Card>

                    {/* Recurring — the same list as the Recurring page */}
                    <Card
                        icon={<Repeat className="w-4 h-4" />}
                        title="Recurring (as in app)"
                        hint={`${dataPayload.recurring.detected.active.length} active · ≈${money(dataPayload.recurring.detected.activeMonthlyCostInBase)} ${meta.baseCurrency}/mo`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {[...dataPayload.recurring.detected.missed, ...dataPayload.recurring.detected.active].map(item => (
                                <div key={`${item.name}|${item.category}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">
                                            {item.name}
                                            {item.status === 'missed' && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 uppercase tracking-wide">missed</span>}
                                            {item.isNew && item.status === 'active' && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-sky-100 text-sky-700 uppercase tracking-wide">new</span>}
                                        </span>
                                        <span className="block text-xs text-gray-400">
                                            {item.cadence}{item.typicalDayOfMonth ? ` · ~${ordinal(item.typicalDayOfMonth)}` : ''} · {item.status === 'missed' ? 'expected' : 'next'} {item.nextExpectedDate}
                                            {item.priceChange && <span className="text-rose-500"> · price {item.priceChange.from} → {item.priceChange.to} {item.priceChange.currency}</span>}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-gray-900">{nativeMoney(item.typicalAmount, item.currency)}</div>
                                        <div className="text-xs text-gray-400">{money(item.monthlyCostInBase)} {meta.baseCurrency}/mo</div>
                                    </div>
                                </div>
                            ))}
                            {dataPayload.recurring.detected.active.length === 0 && dataPayload.recurring.detected.missed.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No fixed recurring charges detected yet.</p>
                            )}
                            {(dataPayload.recurring.detected.ended.length > 0 || dataPayload.recurring.detected.hiddenByUser.length > 0) && (
                                <p className="text-xs text-gray-400 px-1">
                                    Also exported: {dataPayload.recurring.detected.ended.length} ended
                                    {dataPayload.recurring.detected.hiddenByUser.length > 0 && <> · {dataPayload.recurring.detected.hiddenByUser.length} hidden by you (flagged so the model skips them)</>}
                                </p>
                            )}
                        </div>
                    </Card>

                    {/* Repeating habits — the wider profile */}
                    <Card
                        icon={<Repeat className="w-4 h-4" />}
                        title="Repeating Habits (wide)"
                        hint={`~${money(dataPayload.recurring.estimatedFixedMonthlyCost)} / mo fixed`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.recurring.rows.slice(0, 12).map(item => (
                                <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">{item.name}</span>
                                        <span className="block text-xs text-gray-400">
                                            {item.cadence} · ±{item.amountVariationPct}%
                                            {item.status === 'lapsed' && <span className="text-amber-600 font-medium"> · lapsed</span>}
                                        </span>
                                    </div>
                                    <span className="font-semibold text-gray-900 shrink-0">{money(item.estimatedMonthlyCost)}/mo</span>
                                </div>
                            ))}
                            {dataPayload.recurring.rows.length === 0 && (
                                <p className="text-gray-400 text-sm italic">Not enough history to detect recurring charges.</p>
                            )}
                        </div>
                    </Card>

                    {/* FX */}
                    <Card
                        icon={<ArrowRightLeft className="w-4 h-4" />}
                        title="Exchange Rates You Paid"
                        hint={
                            dataPayload.fx.marketBenchmark.totalLostToExchangersInBase === null
                                ? `${dataPayload.fx.crossCurrencyConversions} conversions`
                                : `${dataPayload.fx.crossCurrencyConversions} conversions · exchangers kept ${money(dataPayload.fx.marketBenchmark.totalLostToExchangersInBase)} ${meta.baseCurrency}`
                        }
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.fx.pairs.map(p => (
                                <div key={p.pair} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700">{p.spends} → {p.receives}</span>
                                        <span className="block text-xs text-gray-400">
                                            {p.count}× · spread {p.spreadPct}%
                                            {p.vsMarketPct !== null && (
                                                <span className={p.vsMarketPct < 0 ? 'text-rose-500' : 'text-emerald-600'}>
                                                    {' '}· vs market {p.vsMarketPct > 0 ? '+' : ''}{p.vsMarketPct}%
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-gray-900">{p.weightedAvgRate}</div>
                                        <div className="text-xs text-gray-400">{p.rateMeaning}</div>
                                    </div>
                                </div>
                            ))}
                            {dataPayload.fx.pairs.length === 0 && (
                                <p className="text-gray-400 text-sm italic">
                                    No cross-currency transfers found. Re-import your file if transfers were added before currency legs were supported.
                                </p>
                            )}
                        </div>
                    </Card>

                    {/* Accounts */}
                    <Card
                        icon={<Wallet className="w-4 h-4" />}
                        title="Wallet Balances"
                        hint={`net worth ${money(summary.netWorthInBase)} ${meta.baseCurrency} · volatile ${dataPayload.accounts.volatileAssets.sharePct}%${dataPayload.accounts.walletsWithOutdatedBalance ? ` · ${dataPayload.accounts.walletsWithOutdatedBalance} outdated` : ''}`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.accounts.byCurrency.length > 0 && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-gray-500">
                                    {dataPayload.accounts.byCurrency.filter(c => c.sharePct >= 0.5).map(c => (
                                        <span key={c.currency}><span className="font-semibold text-gray-700">{c.currency === 'USD' ? 'USD·USDT' : c.currency}</span> {c.sharePct}%</span>
                                    ))}
                                </div>
                            )}
                            {dataPayload.accounts.rows.map(a => (
                                <div key={a.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">
                                            {a.name}
                                            {a.balanceLikelyOutdated && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 uppercase tracking-wide">outdated</span>}
                                        </span>
                                        <span className="block text-xs text-gray-400">
                                            {a.currency} · {a.spendCount} tx · {a.balanceEnteredOn ? `entered ${a.balanceEnteredOn}` : 'no balance date'}
                                            {a.balanceLikelyOutdated && <span className="text-amber-600"> · {a.operationsSinceBalance} ops since</span>}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-gray-900">{nativeMoney(a.balance, a.currency)}</div>
                                        <div className="text-xs text-gray-400">{money(a.balanceInBase)} {meta.baseCurrency}</div>
                                    </div>
                                </div>
                            ))}
                            {dataPayload.accounts.rows.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No wallets configured yet.</p>
                            )}
                        </div>
                    </Card>

                    {/* Data Quality */}
                    <Card
                        icon={<AlertTriangle className="w-4 h-4" />}
                        title="Data Quality Report"
                        hint="included in export"
                    >
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar text-sm">
                            {[
                                { label: 'Payee tag coverage', value: `${dataQuality.payeeTagCoveragePct}%`, warn: dataQuality.payeeTagCoveragePct < 90 },
                                { label: 'Note coverage', value: `${dataQuality.noteCoveragePct}%`, warn: false },
                                { label: 'Uncategorized rows', value: String(dataQuality.uncategorizedRows), warn: dataQuality.uncategorizedRows > 0 },
                                { label: 'Transfers missing currency legs', value: String(dataQuality.transfersMissingCurrencyLegs), warn: dataQuality.transfersMissingCurrencyLegs > 0 },
                                { label: 'Conversions with implausible rate', value: String(dataQuality.conversionsWithImplausibleRate), warn: dataQuality.conversionsWithImplausibleRate > 0 },
                                { label: 'Rows not in base currency', value: String(dataQuality.rowsNotInBaseCurrency), warn: dataQuality.rowsNotInBaseCurrency > 0 },
                                { label: 'Repeated identical rows', value: String(dataQuality.repeatedIdenticalRows.groups), warn: false },
                                { label: 'Wallets with zero balance', value: String(dataQuality.accountsWithZeroBalance.length), warn: dataQuality.accountsWithZeroBalance.length > 0 },
                                { label: 'Months with no records', value: String(dataQuality.monthsWithNoRecords.length), warn: dataQuality.monthsWithNoRecords.length > 0 },
                            ].map(row => (
                                <div key={row.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="text-gray-600">{row.label}</span>
                                    <span className={`font-semibold ${row.warn ? 'text-amber-600' : 'text-gray-900'}`}>{row.value}</span>
                                </div>
                            ))}
                            {dataQuality.categoriesFallingBackToOther.length > 0 && (
                                <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
                                    Categories with no group mapping: {dataQuality.categoriesFallingBackToOther.join(', ')}
                                </div>
                            )}
                        </div>
                    </Card>

                </div>
            </div>
        </div >
    );
}

function Card({
    title,
    hint,
    icon,
    children,
}: {
    title: string;
    hint?: string;
    icon?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-baseline mb-4 gap-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    {icon}
                    {title}
                </h3>
                {hint && <span className="text-xs font-medium text-gray-400 text-right shrink-0">{hint}</span>}
            </div>
            {children}
        </div>
    );
}
