import { useState, useMemo } from 'react';
import { Download, Copy, CheckCircle, FileJson, Bot, Info, Eye } from 'lucide-react';
import { getGlobalCategory } from '../lib/categoryGroups';
import type { Transaction } from '../types';

interface AIExportPageProps {
    transactions: Transaction[];
}

export function AIExportPage({ transactions }: AIExportPageProps) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Memoize the data payload generation to use it for both download and preview
    const dataPayload = useMemo(() => {
        // Sort transactions by date descending
        const sortedDetails = [...transactions].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        const startDate = sortedDetails.length > 0 ? sortedDetails[sortedDetails.length - 1].date : 'N/A';
        const endDate = sortedDetails.length > 0 ? sortedDetails[0].date : 'N/A';
        const fullPeriodStr = `${startDate} to ${endDate}`;

        // 1. Monthly Stats
        const monthlyStatsRaw = sortedDetails.reduce((acc, t) => {
            const monthKey = t.date.slice(0, 7); // YYYY-MM
            if (!acc[monthKey]) {
                acc[monthKey] = { income: 0, expenses: 0, savings: 0, transactionCount: 0 };
            }
            if (t.type === 'income') {
                acc[monthKey].income += t.amount;
            } else if (t.type === 'expense') {
                acc[monthKey].expenses += t.amount;
            }
            acc[monthKey].transactionCount += 1;
            return acc;
        }, {} as Record<string, { income: number; expenses: number; savings: number; transactionCount: number }>);

        // Calculate savings
        Object.keys(monthlyStatsRaw).forEach(key => {
            monthlyStatsRaw[key].savings = monthlyStatsRaw[key].income - monthlyStatsRaw[key].expenses;
        });

        // 2. All Expenses (by Global Category)
        const categoryExpenses = sortedDetails
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => {
                const mainCategory = getGlobalCategory(t.category);
                // Accumulate absolute values for cleaner "Spending" stats
                acc[mainCategory] = (acc[mainCategory] || 0) + Math.abs(t.amount);
                return acc;
            }, {} as Record<string, number>);

        const expensesByCategory = Object.entries(categoryExpenses)
            .sort(([, a], [, b]) => b - a) // Sort by magnitude (descending)
            .map(([category, amount]) => ({ category, amount }));

        // 3. Subscriptions (Last 3 Months Only)
        // Reverted to 90 days as requested.
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const recentDetails = sortedDetails.filter(t => new Date(t.date) >= ninetyDaysAgo);

        const subscriptionsMap = recentDetails
            .filter(t => {
                const cat = t.category.toLowerCase();
                const acc = (t.account || '').toLowerCase();
                // Use partial match instead of strict equality to catch "Online Subscriptions", "Apple Subscriptions", etc.
                // Also explicitly check for Crypto/Bybit as requested by user.
                const isSubscriptionCategory = cat.includes('subscription') || cat.includes('подписк');
                const isCryptoSource = cat.includes('bybit') || cat.includes('usdt') || acc.includes('bybit') || acc.includes('usdt');

                return isSubscriptionCategory || isCryptoSource;
            })
            .reduce((acc, t) => {
                // User rule: Tag = Service Name
                // Group by Name + Account to distinguish different payment sources (e.g. RUB vs USDT)
                const serviceName = t.tags || t.note || 'Unknown Subscription';
                const accountName = t.account || 'Unknown Account';
                const uniqueKey = `${serviceName} (${accountName})`;

                if (!acc[uniqueKey]) {
                    acc[uniqueKey] = {
                        name: uniqueKey,
                        amount: Math.abs(t.amount), // Use positive amount
                        count: 0
                    };
                }
                acc[uniqueKey].count += 1;
                return acc;
            }, {} as Record<string, { name: string; amount: number; count: number }>);

        const subscriptions = Object.values(subscriptionsMap)
            .sort((a, b) => b.amount - a.amount); // Sort by cost descending

        // 4. Income Sources (New)
        // Aggregating income by category to see revenue streams
        const incomeMap = sortedDetails
            .filter(t => t.type === 'income')
            .reduce((acc, t) => {
                const source = t.category || 'Uncategorized Income';
                acc[source] = (acc[source] || 0) + t.amount;
                return acc;
            }, {} as Record<string, number>);

        const incomeSources = Object.entries(incomeMap)
            .sort(([, a], [, b]) => b - a)
            .map(([source, amount]) => ({ source, amount }));

        // 5. Top Merchants / Tags (New)
        // Grouping expenses by Tag (or Note) to find specific money leaks (e.g. "Starbucks", "Grab")
        // Excluding transfers and subscriptions (already covered)
        const merchantsMap = sortedDetails
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => {
                // Prefer Tag, fallback to Note, fallback to "Unknown"
                // Clean up the name (trim, lowercase for aggregation but display proper case)
                let name = t.tags || t.note;

                if (!name || name.length < 2) return acc; // Skip empty/trivial notes

                // Simple normalization
                const key = name.toLowerCase().trim();

                if (!acc[key]) {
                    acc[key] = { name: name.trim(), amount: 0, count: 0 };
                }
                acc[key].amount += Math.abs(t.amount);
                acc[key].count += 1;
                return acc;
            }, {} as Record<string, { name: string; amount: number; count: number }>);

        const topMerchants = Object.values(merchantsMap)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 15); // Top 15 specific places

        // 6. Last 500 Transactions
        const last500Transactions = sortedDetails.slice(0, 500);

        return {
            profile: {
                baseCurrency: 'RUB',
                context: 'Living in Thailand (THB/USDT)',
                generatedAt: new Date().toISOString(),
                totalTransactions: transactions.length,
                period: { start: startDate, end: endDate }
            },
            monthlyStats: {
                period: fullPeriodStr,
                data: monthlyStatsRaw
            },
            incomeSources: {
                period: fullPeriodStr,
                data: incomeSources
            },
            expensesByCategory: {
                period: fullPeriodStr,
                data: expensesByCategory
            },
            topMerchants: {
                period: fullPeriodStr,
                data: topMerchants
            },
            subscriptions: {
                period: 'Last 90 Days',
                data: subscriptions
            },
            recentTransactions: {
                period: last500Transactions.length > 0 ? `${last500Transactions[last500Transactions.length - 1].date} to ${last500Transactions[0].date}` : 'N/A',
                data: last500Transactions
            }
        };
    }, [transactions]);

    const handleDownload = () => {
        setIsDownloading(true);

        // Simulate a slight delay for better UX
        setTimeout(() => {
            const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grow_money_data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setIsDownloading(false);
        }, 800);
    };

    const instructionText = `I have attached a JSON file containing my complete financial transactions and statistics.
Context: My base currency is RUB, but I live in Thailand (THB/USDT).
Role: Act as a pro Wealth Manager.
Task: Analyze the attached file and provide:
1. An audit of my spending habits (where am I leaking money?).
2. A forecast for the next 3 months based on the transaction history.
3. Investment advice considering my savings rate.
Output: Structure your answer with clear headings and bullet points.`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(instructionText);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

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
                        <FileJson className="w-5 h-5 text-gray-400" />
                    </div>

                    <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                        Generate a secure, privacy-focused JSON file containing your transaction history, spending habits, and detected subscriptions.
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
                        {isDownloading ? 'Generating...' : 'Download grow_money_data.json'}
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
                        {isCopied ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500 transition-all scale-110" />
                        ) : (
                            <Copy className="w-5 h-5 text-gray-400" />
                        )}
                    </div>

                    <div className="relative mb-6 group">
                        <textarea
                            readOnly
                            value={instructionText}
                            className="w-full h-32 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>

                    <button
                        onClick={handleCopy}
                        className={`w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm ${isCopied
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        {isCopied ? 'Copied to Clipboard!' : 'Copy Prompt Text'}
                    </button>
                </div>
            </div>

            {/* How it works Hint */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200/60">
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                        <Info className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-2">How to use</h3>
                        <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside marker:text-gray-400 marker:font-medium">
                            <li>Click <strong>Download Data File</strong> to save your processed financial data.</li>
                            <li>Open <strong>ChatGPT</strong> (Plus recommended) or <strong>Google Gemini</strong>.</li>
                            <li>Upload the downloaded <code className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-xs font-mono">.json</code> file.</li>
                            <li>Paste the copied instructions into the chat input.</li>
                        </ol>
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

                    {/* Monthly Stats Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Monthly Summary</h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.monthlyStats.period}
                            </span>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {Object.entries(dataPayload.monthlyStats.data)
                                .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date desc
                                .map(([month, stats]) => (
                                    <div key={month} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                                        <span className="font-medium text-gray-700">{month}</span>
                                        <div className="text-right">
                                            <div className="text-emerald-600 font-medium">+{stats.income.toLocaleString('ru-RU')}</div>
                                            <div className="text-red-500 text-xs">-{stats.expenses.toLocaleString('ru-RU')}</div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Income Breakdown Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Income Sources</h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.incomeSources.period}
                            </span>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.incomeSources.data.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">{item.source}</span>
                                    <span className="font-semibold text-emerald-600">+{item.amount.toLocaleString('ru-RU')}</span>
                                </div>
                            ))}
                            {dataPayload.incomeSources.data.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No income records found.</p>
                            )}
                        </div>
                    </div>

                    {/* All Expenses Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Expense Categories <span className="text-gray-400 normal-case">({dataPayload.expensesByCategory.data.length})</span></h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.expensesByCategory.period}
                            </span>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.expensesByCategory.data.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600 truncate max-w-[180px]">{item.category}</span>
                                    <span className="font-semibold text-gray-900">{item.amount.toLocaleString('ru-RU')}</span>
                                </div>
                            ))}
                            <div className="pt-2 text-center text-xs text-gray-400">
                                + {dataPayload.expensesByCategory.data.length - 5} more included in export
                            </div>
                        </div>
                    </div>

                    {/* Top Merchants Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Top Payees (Tags)</h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.topMerchants.period}
                            </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.topMerchants.data.slice(0, 8).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                                    <span className="font-medium text-gray-700 truncate max-w-[60%]">{item.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">{item.count}x</span>
                                        <span className="font-semibold text-gray-900">{item.amount.toLocaleString('ru-RU')}</span>
                                    </div>
                                </div>
                            ))}
                            {dataPayload.topMerchants.data.length === 0 && (
                                <p className="text-gray-400 text-sm italic">No expense details found.</p>
                            )}
                        </div>
                    </div>

                    {/* Detected Subscriptions Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Subscriptions <span className="text-gray-400 normal-case">({dataPayload.subscriptions.data.length})</span></h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.subscriptions.period}
                            </span>
                        </div>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                            {dataPayload.subscriptions.data.length > 0 ? (
                                dataPayload.subscriptions.data.map((sub, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg text-sm">
                                        <span className="font-medium text-gray-700 truncate max-w-[70%]">{sub.name}</span>
                                        <span className="text-indigo-600 font-semibold">{sub.amount.toLocaleString('ru-RU')}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-400 text-sm italic">No recurring payments detected yet.</p>
                            )}
                        </div>
                    </div>

                    {/* Recent Transactions Peek */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex justify-between items-baseline mb-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Transactions</h3>
                            <span className="text-xs font-medium text-gray-400">
                                {dataPayload.recentTransactions.period}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {dataPayload.recentTransactions.data.slice(0, 5).map((t, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs text-gray-500 border-b border-gray-50 pb-2 last:border-0">
                                    <div>
                                        <span className="block font-medium text-gray-700">{t.date}</span>
                                        <span className="truncate max-w-[150px] inline-block">{t.note || t.category}</span>
                                    </div>
                                    <span className={t.type === 'income' ? 'text-emerald-600' : 'text-gray-900'}>
                                        {t.type === 'income' ? '+' : ''}{t.amount.toLocaleString('ru-RU')}
                                    </span>
                                </div>
                            ))}
                            <div className="pt-2 text-center">
                                <span className="text-xs text-indigo-500 font-medium">+ {dataPayload.recentTransactions.data.length - 5} more included in export</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
