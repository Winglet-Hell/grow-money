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
} from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { useAccounts } from '../hooks/useAccounts';
import { buildAIExportPayload, toPrettyJson } from '../lib/aiExport';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

interface AIExportPageProps {
    transactions: Transaction[];
}

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
    const trips = useTrips();

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
                })),
                netWorth: totalNetWorth,
                liveRates: { rates, date: null, isLive: isLiveRates },
                trips,
                paycheck: settings.preferences.paycheck,
            }),
        [transactions, accounts, totalNetWorth, rates, isLiveRates, trips, settings.preferences.paycheck]
    );

    const json = useMemo(() => toPrettyJson(dataPayload), [dataPayload]);
    const fileSizeKb = useMemo(() => Math.round(new Blob([json]).size / 1024), [json]);

    const money = (n: number | null | undefined, sign = '') =>
        isPrivacyMode || n === null || n === undefined ? '•••' : sign + Math.round(n).toLocaleString('ru-RU');

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

    const instructionText = `Роль: Действуй как Wealth Manager и Data-аналитик, который отвечает за результат своих рекомендаций. Тон прямой и профессиональный, выводы — только из цифр. Никакой «воды», банальностей и мотивационных советов.

Данные:
В прикрепленном JSON — полная история моих финансовых операций и посчитанная по ней аналитика. Мой профиль (город, виза, работа, привычки, валюты) — в блоке profile.
Прежде чем считать, прочитай meta.readMeFirst, meta.schema и поля note внутри блоков: там единицы измерения, знаки, формат таблиц и подводные камни конкретных полей. Они важнее твоих предположений о том, как обычно устроены такие файлы.

Правила (нарушение любого делает ответ бесполезным):
1. Каждое утверждение — с цифрой и указанием блока, откуда она взята (например: expenses.byCategory).
2. Не пересчитывай то, что уже посчитано в файле. Если твоя цифра расходится с готовым агрегатом — покажи расхождение, а не прячь его.
3. Ничего не выдумывай. Не хватает данных для вывода — так и напиши.
4. Внешние знания (цены в Бангкоке, доходности инструментов, прогнозы курсов) помечай как «внешнее допущение» и держи отдельно от фактов из файла.
5. Никаких общих советов. Каждая рекомендация = действие + эффект в рублях в месяц + срок + на чем основана.
6. Не пересказывай мне мои данные. Я их видел. Мне нужны выводы.

Структура ответа:

1. ВЕРДИКТ. Максимум 7 строк: где я нахожусь, что главное сломано, во сколько это обходится мне в год.

2. УТЕЧКИ. Таблица топ-10, отсортированных по потерям в рублях в год. Колонки: что | ₽/мес и ₽/год | доля от расходов | доля от дохода | почему это утечка | что делать. Источники: expenses.byCategory, payees.rows, recurring.rows, expenses.largest. Отдельно назови подписки со статусом lapsed — это кандидаты на отмену, про которые я мог забыть.

3. СБЕРЕЖЕНИЯ И УСТОЙЧИВОСТЬ. Динамика savingsRatePct (monthly.rows) и тренд 3 месяца против 6 против всего периода (monthly.averages). Концентрация дохода (income.concentrationTopSourcePct): что будет, если основной источник отвалится, и на сколько месяцев меня хватит при текущих расходах и балансах из accounts.rows. Валютная уязвимость — expenses.byCurrency, expenses.monthlyByCurrency.

4. КОНВЕРТАЦИИ. По fx.pairs и fx.conversions посчитай в рублях, сколько я потерял на разнице между своим средним и лучшим курсом по каждой паре. Где спред самый большой. Сравни мои курсы с fx.liveRates. Дай правила: что менять через что и какими суммами.

5. ПРОГНОЗ НА 3 МЕСЯЦА. Только по полным месяцам. Назови метод. Базовый и пессимистичный сценарий с диапазоном, а не одно число. Что дает наибольший разброс (expenses.categoryTrends) и что способно сломать прогноз.

6. КАПИТАЛ. Что делать со свободными средствами при моей структуре счетов (accounts.rows, summary.netWorthInBase) и моей норме сбережений. Учитывай интерес к крипте, защите от инфляции и автоматизации. Явно отдели то, что следует из моих данных, от общих рекомендаций.

7. КАЧЕСТВО УЧЕТА. По блоку dataQuality: что мешает точной аналитике и что мне начать фиксировать, чтобы через 3 месяца ответы стали точнее. Отсортируй по влиянию на выводы.

Формат вывода:
Таблицы для сравнений, списки для действий, ключевые цифры жирным. Без вступлений и заключений. Раздел не подкреплен данными — одна строка почему и переходи дальше. Жду суровую правду и выполнимые рекомендации.`;

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
                                className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
                                title="Copy JSON to clipboard"
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
                        Full history plus pre-computed analytics: monthly series, category matrix, merchants,
                        recurring charges, FX rates you actually paid, wallet balances and a data-quality report.
                    </p>

                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow"
                    >
                        {isDownloading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Download className="w-5 h-5" />
                        )}
                        {isDownloading ? 'Generating...' : 'Download JSON'}
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

                    {/* Recurring */}
                    <Card
                        icon={<Repeat className="w-4 h-4" />}
                        title="Recurring Charges"
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
                        hint={`${dataPayload.fx.crossCurrencyConversions} conversions`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.fx.pairs.map(p => (
                                <div key={p.pair} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700">{p.spends} → {p.receives}</span>
                                        <span className="block text-xs text-gray-400">
                                            {p.count}× · spread {p.spreadPct}%
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
                        hint={`net worth ${money(summary.netWorthInBase)} ${meta.baseCurrency}`}
                    >
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.accounts.rows.map(a => (
                                <div key={a.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm transition-colors hover:bg-gray-100">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">{a.name}</span>
                                        <span className="block text-xs text-gray-400">
                                            {a.currency} · {a.spendCount} tx
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-gray-900">{money(a.balance)}</div>
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
