import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Calendar, Plus, Trash2, CheckCircle2, Map, Plane, Calculator, Search, X, Pencil, Check, Sparkles, Wallet, TrendingUp } from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { db } from '../lib/db';
import { cn, stringToColor, formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { getCategoryIcon } from '../lib/categoryIcons';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import { useUserSettings } from '../hooks/useUserSettings';

// Helper to format currency if not imported
const formatMoney = (amount: number, currency = 'RUB') => {
    try {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch (e) {
        // Fallback for non-standard currencies (like USDT, BTC)
        return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
    }
};



interface TripAnalyticsPageProps {
    transactions: Transaction[];
}

export function TripAnalyticsPage({ transactions }: TripAnalyticsPageProps) {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const { settings, updatePreferences } = useUserSettings();

    // New Trip Form State
    const [newTripName, setNewTripName] = useState('');
    const [newTripStart, setNewTripStart] = useState('');
    const [newTripEnd, setNewTripEnd] = useState('');

    // Renaming State
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempTripName, setTempTripName] = useState('');

    // Add Transaction Modal State
    const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Trip Transactions Search State
    const [tripTxSearchQuery, setTripTxSearchQuery] = useState('');
    const [filterDate, setFilterDate] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id);
                loadTrips(session.user.id);
            } else {
                loadLocalTrips();
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                setUserId(session.user.id);
                loadTrips(session.user.id);
            } else {
                setUserId(null);
                setTrips([]);
            }
        });

        return () => subscription.unsubscribe();
    }, []);



    const loadLocalTrips = async () => {
        const loadedTrips = await db.trips.toArray();
        loadedTrips.sort((a, b) => b.startDate.localeCompare(a.startDate));
        // Ensure additionalTransactionIds exists
        const sanitizedTrips = loadedTrips.map(t => ({
            ...t,
            additionalTransactionIds: t.additionalTransactionIds || []
        }));
        setTrips(sanitizedTrips);
    };

    const loadTrips = async (currentUserId: string) => {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .eq('user_id', currentUserId)
            .order('start_date', { ascending: false });

        if (error) {
            console.error('Error loading trips:', error);
            return;
        }

        if (data) {
            const mappedTrips: Trip[] = data.map(t => ({
                id: t.id,
                name: t.name,
                startDate: t.start_date,
                endDate: t.end_date,
                excludedTransactionIds: t.excluded_transaction_ids || [],
                additionalTransactionIds: t.additional_transaction_ids || []
            }));
            setTrips(mappedTrips);
        }
    };

    const handleCreateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTripName || !newTripStart || !newTripEnd) return;

        if (userId) {
            const { data, error } = await supabase
                .from('trips')
                .insert({
                    user_id: userId,
                    name: newTripName,
                    start_date: newTripStart,
                    end_date: newTripEnd,
                    excluded_transaction_ids: [],
                    additional_transaction_ids: []
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating trip:', error);
                alert('Failed to save trip to cloud.');
                return;
            }

            const newTrip: Trip = {
                id: data.id,
                name: data.name,
                startDate: data.start_date,
                endDate: data.end_date,
                excludedTransactionIds: data.excluded_transaction_ids || [],
                additionalTransactionIds: data.additional_transaction_ids || []
            };
            setTrips(prev => [newTrip, ...prev]);

        } else {
            const newTrip: Trip = {
                id: crypto.randomUUID(),
                name: newTripName,
                startDate: newTripStart,
                endDate: newTripEnd,
                excludedTransactionIds: [],
                additionalTransactionIds: []
            };

            await db.trips.add(newTrip);
            setTrips(prev => [newTrip, ...prev]);
        }

        setIsCreating(false);
        resetForm();
    };

    const handleDeleteTrip = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this trip?')) return;

        if (userId) {
            const { error } = await supabase.from('trips').delete().eq('id', id);
            if (error) {
                console.error('Error deleting trip:', error);
                return;
            }
        } else {
            await db.trips.delete(id);
        }

        setTrips(prev => prev.filter(t => t.id !== id));
        if (selectedTrip?.id === id) setSelectedTrip(null);
    };

    const handleUpdateTripName = async (newName: string) => {
        if (!selectedTrip || !newName.trim()) return;

        const updatedTrip = { ...selectedTrip, name: newName };
        setSelectedTrip(updatedTrip);
        setTrips(prev => prev.map(t => t.id === selectedTrip.id ? updatedTrip : t));

        if (userId) {
            const { error } = await supabase
                .from('trips')
                .update({ name: newName })
                .eq('id', selectedTrip.id);
            if (error) console.error('Error updating trip name:', error);
        } else {
            await db.trips.update(selectedTrip.id, { name: newName });
        }
        setIsEditingName(false);
    };

    const resetForm = () => {
        setNewTripName('');
        setNewTripStart('');
        setNewTripEnd('');
    };

    const updateTripTransactions = async (newExcludedIds: string[], newAdditionalIds: string[]) => {
        if (!selectedTrip) return;

        const updatedTrip = {
            ...selectedTrip,
            excludedTransactionIds: newExcludedIds,
            additionalTransactionIds: newAdditionalIds
        };

        setSelectedTrip(updatedTrip);
        setTrips(prev => prev.map(t => t.id === selectedTrip.id ? updatedTrip : t));

        if (userId) {
            const { error } = await supabase
                .from('trips')
                .update({
                    excluded_transaction_ids: newExcludedIds,
                    additional_transaction_ids: newAdditionalIds
                })
                .eq('id', selectedTrip.id);
            if (error) console.error('Error updating txs:', error);
        } else {
            await db.trips.update(selectedTrip.id, {
                excludedTransactionIds: newExcludedIds,
                additionalTransactionIds: newAdditionalIds
            });
        }
    };

    const toggleTransactionExclusion = async (txId: string) => {
        if (!selectedTrip) return;
        const isExcluded = selectedTrip.excludedTransactionIds.includes(txId);
        const newExcludedIds = isExcluded
            ? selectedTrip.excludedTransactionIds.filter(id => id !== txId)
            : [...selectedTrip.excludedTransactionIds, txId];

        await updateTripTransactions(newExcludedIds, selectedTrip.additionalTransactionIds || []);
    };

    const handleAddExistingTransaction = async (txId: string) => {
        if (!selectedTrip) return;
        const currentAdditional = selectedTrip.additionalTransactionIds || [];
        if (currentAdditional.includes(txId)) return; // Already added

        const newAdditionalIds = [...currentAdditional, txId];
        await updateTripTransactions(selectedTrip.excludedTransactionIds, newAdditionalIds);
    };


    const tripStats = useMemo(() => {
        if (!selectedTrip) return null;

        const start = selectedTrip.startDate;
        const end = selectedTrip.endDate;
        const additionalIds = selectedTrip.additionalTransactionIds || [];

        const rangeTransactions = transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            return txDate >= start && txDate <= end && t.type === 'expense';
        });

        const additionalTransactions = transactions.filter(t => additionalIds.includes(t.id));

        const allPotential = [...rangeTransactions];
        additionalTransactions.forEach(t => {
            if (!allPotential.find(pt => pt.id === t.id)) {
                allPotential.push(t);
            }
        });

        const activeTransactions = allPotential.filter(t => !selectedTrip.excludedTransactionIds.includes(t.id));
        activeTransactions.sort((a, b) => b.date.localeCompare(a.date));

        const totalCost = activeTransactions.reduce((sum, t) => sum + t.amount, 0);

        // Calculate Net Spending (On Location)
        // User logic: Exclude transactions that happened outside the trip dates (e.g. pre-booked flights/hotels)
        const onLocationTransactions = activeTransactions.filter(t => {
            const txDate = t.date.split('T')[0];
            return txDate >= start && txDate <= end;
        });
        const netOnLocationCost = onLocationTransactions.reduce((sum, t) => sum + t.amount, 0);

        // Calculate Breakdowns
        const categoryMap: Record<string, number> = {};

        activeTransactions.forEach(t => {
            const amount = Math.abs(t.amount);

            // Detailed Category
            const cat = t.category;
            categoryMap[cat] = (categoryMap[cat] || 0) + amount;
        });

        // Convert to sorted arrays
        const byCategory = Object.entries(categoryMap)
            .map(([name, amount]) => ({
                name,
                amount,
                percentage: totalCost ? (amount / Math.abs(totalCost)) * 100 : 0
            }))
            .sort((a, b) => b.amount - a.amount);

        const maxCategoryAmount = byCategory.length > 0 ? byCategory[0].amount : 0;
        const byCategoryWithWidth = byCategory.map(item => ({
            ...item,
            widthPercentage: maxCategoryAmount ? (item.amount / maxCategoryAmount) * 100 : 0
        }));

        // Daily Spending Chart Data
        const dailyMap: Record<string, number> = {};
        let current = new Date(start);
        const endDt = new Date(end);

        while (current <= endDt) {
            dailyMap[current.toISOString().split('T')[0]] = 0;
            current.setDate(current.getDate() + 1);
        }

        activeTransactions.forEach(t => {
            const dateKey = t.date.split('T')[0];
            if (dailyMap.hasOwnProperty(dateKey)) {
                dailyMap[dateKey] = (dailyMap[dateKey] || 0) + Math.abs(t.amount);
            }
        });

        const dailySpending = Object.entries(dailyMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, amount]) => {
                const d = new Date(date);
                return {
                    date: `${d.getDate()}.${d.getMonth() + 1}`,
                    fullDate: date,
                    amount
                };
            });

        // Biggest Spends
        const biggestSpends = [...activeTransactions]
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
            .slice(0, 50);


        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const dailyAverage = totalCost / (days || 1);
        const dailyAverageOnLocation = netOnLocationCost / (days || 1);

        return {
            activeTransactions,
            totalCost,
            netOnLocationCost,
            dailyAverage,
            dailyAverageOnLocation,
            days,
            allTripTransactions: allPotential,
            byCategory: byCategoryWithWidth,
            dailySpending,
            biggestSpends
        };
    }, [selectedTrip, transactions]);

    const comparisonStats = useMemo(() => {
        if (!selectedTrip || !tripStats) return null;

        const activeIds = new Set(tripStats.activeTransactions.map(t => t.id));

        const otherExpenses = transactions.filter(t =>
            t.type === 'expense' && !activeIds.has(t.id)
        );

        if (otherExpenses.length === 0) return { avgDaily: 0, deviationPercent: 0 };

        const uniqueDays = new Set(otherExpenses.map(t => t.date.split('T')[0])).size;
        const totalOther = otherExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const avgDailyAbs = uniqueDays > 0 ? totalOther / uniqueDays : 0;
        const tripDailyAbs = Math.abs(tripStats.dailyAverage);

        const deviationPercent = avgDailyAbs > 0
            ? ((tripDailyAbs - avgDailyAbs) / avgDailyAbs) * 100
            : 0;

        // Return negative avgDaily to match other expense displays
        return { avgDaily: -avgDailyAbs, deviationPercent };

    }, [transactions, selectedTrip, tripStats]);

    const allTripsTotalCost = useMemo(() => {
        return trips.reduce((acc, trip) => {
            const start = trip.startDate;
            const end = trip.endDate;
            const additionalIds = trip.additionalTransactionIds || [];

            const tripCost = transactions.reduce((sum, t) => {
                const txDate = t.date.split('T')[0];
                const inRange = txDate >= start && txDate <= end && t.type === 'expense';
                const isAdditional = additionalIds.includes(t.id);
                const isExcluded = (trip.excludedTransactionIds || []).includes(t.id);

                if ((inRange || isAdditional) && !isExcluded) {
                    return sum + t.amount;
                }
                return sum;
            }, 0);

            return acc + tripCost;
        }, 0);
    }, [trips, transactions]);

    const searchResults = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        const existingIds = new Set(tripStats?.allTripTransactions.map(t => t.id) || []);

        return transactions
            .filter(t => {
                // 1. Existing check
                if (existingIds.has(t.id)) return false;
                if (t.type !== 'expense') return false;

                // 2. Query string match (skip if empty)
                if (!lowerQ) return true;

                return (t.category || '').toLowerCase().includes(lowerQ) ||
                    (t.note && t.note.toLowerCase().includes(lowerQ)) ||
                    (t.amount || 0).toString().includes(lowerQ) ||
                    (t.account && t.account.toLowerCase().includes(lowerQ)) ||
                    // Search in tags
                    (Array.isArray(t.tags) && t.tags.some(tag => tag && tag.toLowerCase().includes(lowerQ))) ||
                    (typeof t.tags === 'string' && (t.tags as string).toLowerCase().includes(lowerQ)) ||
                    // Search in original currency fields
                    (t.originalCurrency && t.originalCurrency.toLowerCase().includes(lowerQ)) ||
                    (t.originalAmount && t.originalAmount.toString().includes(lowerQ));
            })
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 50);
    }, [transactions, searchQuery, tripStats]);

    const filteredTripTransactions = useMemo(() => {
        if (!tripStats) return [];

        let result = tripStats.allTripTransactions;

        // Filter by Date
        if (filterDate) {
            result = result.filter(t => t.date.startsWith(filterDate));
        }

        // Filter by Category
        if (filterCategory) {
            result = result.filter(t => t.category === filterCategory);
        }

        const lowerQ = tripTxSearchQuery.toLowerCase();
        if (!lowerQ) return result;

        return result.filter(t => {
            return (t.category || '').toLowerCase().includes(lowerQ) ||
                (t.note && t.note.toLowerCase().includes(lowerQ)) ||
                (t.amount || 0).toString().includes(lowerQ) ||
                (t.account && t.account.toLowerCase().includes(lowerQ)) ||
                (Array.isArray(t.tags) && t.tags.some(tag => tag && tag.toLowerCase().includes(lowerQ))) ||
                (typeof t.tags === 'string' && (t.tags as string).toLowerCase().includes(lowerQ));
        });
    }, [tripStats, tripTxSearchQuery, filterDate, filterCategory]);


    // ... existing logic ...

    const handleExportForAI = () => {
        if (!selectedTrip || !tripStats) return;

        const data = {
            trip: {
                name: selectedTrip.name,
                dates: `${formatDate(selectedTrip.startDate)} - ${formatDate(selectedTrip.endDate)}`,
                duration: `${tripStats.days} days`,
                total_cost: tripStats.totalCost,
                daily_average: tripStats.dailyAverage,
                currency: 'RUB' // Assuming RUB based on context
            },
            breakdown: tripStats.byCategory.map(c => ({
                category: c.name,
                amount: c.amount,
                percentage: `${Math.round(c.percentage)}%`
            })),
            daily_spending: tripStats.dailySpending,
            biggest_expenses: tripStats.biggestSpends.map(t => ({
                item: (Array.isArray(t.tags) && t.tags.length > 0) ? t.tags[0] : (t.note || t.category),
                amount: t.amount,
                date: t.date
            }))
        };

        const prompt = `I am providing you with JSON data representing my expenses for a trip called "${selectedTrip.name}". 
Please analyze this data and provide:
1. A summary of the trip's financial impact.
2. Insights on my spending habits (e.g. widely distributed or concentrated).
3. Identification of any outliers or unusual daily spikes.
4. Suggestions on where I could potentially save money next time.

Data:
${JSON.stringify(data, null, 2)}`;

        navigator.clipboard.writeText(prompt);
        alert('Prompt & Data copied to clipboard! Paste it into ChatGPT or Gemini.');
    };


    // -- RENDER: DETAIL VIEW --
    if (selectedTrip && tripStats && comparisonStats) {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                setSelectedTrip(null);
                                setIsEditingName(false);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                        <div className="flex-1 min-w-0">
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={tempTripName}
                                        onChange={(e) => setTempTripName(e.target.value)}
                                        className="text-2xl font-bold text-gray-900 border-b-2 border-emerald-500 focus:outline-none bg-transparent w-full"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleUpdateTripName(tempTripName);
                                            if (e.key === 'Escape') setIsEditingName(false);
                                        }}
                                    />
                                    <button onClick={() => handleUpdateTripName(tempTripName)} className="p-1 hover:bg-emerald-50 rounded-full text-emerald-600 flex-shrink-0">
                                        <Check className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => setIsEditingName(false)} className="p-1 hover:bg-red-50 rounded-full text-red-500 flex-shrink-0">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{selectedTrip.name}</h1>
                                    <button
                                        onClick={() => {
                                            setTempTripName(selectedTrip.name);
                                            setIsEditingName(true);
                                        }}
                                        className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
                                    >
                                        <Pencil className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                            <p className="text-gray-500 text-sm flex items-center gap-2 mt-1 truncate">
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{formatDate(selectedTrip.startDate)} - {formatDate(selectedTrip.endDate)}</span>
                                <span className="text-gray-300 flex-shrink-0">•</span>
                                <span className="flex-shrink-0">{tripStats.days} days</span>
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                        <button
                            onClick={handleExportForAI}
                            className="flex items-center justify-center gap-2 px-3 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium whitespace-nowrap w-full sm:w-auto"
                            title="Copy analysis prompt to clipboard"
                        >
                            <Sparkles className="w-4 h-4" />
                            <span>AI Analysis</span>
                        </button>
                        <button
                            onClick={() => {
                                setSearchQuery(selectedTrip.name);
                                setIsAddTransactionOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 px-3 py-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium whitespace-nowrap w-full sm:w-auto"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Tx</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Cost */}
                    <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2 gap-4">
                                <span className="text-sm font-medium text-gray-500">Total Cost</span>
                                <Wallet className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />
                            </div>
                            <p className="text-3xl font-bold text-gray-900">{formatMoney(tripStats.totalCost)}</p>
                        </div>
                    </div>

                    {/* Net (On Location) */}
                    <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2 gap-4">
                                <span className="text-sm font-medium text-gray-500">Net (On Location)</span>
                                <Map className="w-10 h-10 text-blue-500" strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
                                <p className="text-3xl font-bold text-gray-900">{formatMoney(tripStats.netOnLocationCost)}</p>
                                <span className="text-gray-400 text-sm mb-1.5">({formatMoney(tripStats.dailyAverageOnLocation)}/day)</span>
                            </div>
                        </div>
                    </div>

                    {/* Daily Average */}
                    <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2 gap-4">
                                <span className="text-sm font-medium text-gray-500">Daily Average</span>
                                <Calendar className="w-10 h-10 text-purple-500" strokeWidth={1.5} />
                            </div>
                            <p className="text-3xl font-bold text-gray-900">{formatMoney(tripStats.dailyAverage)}</p>
                        </div>
                    </div>

                    {/* vs. Everyday Spending */}
                    <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2 gap-4">
                                <span className="text-sm font-medium text-gray-500">vs. Everyday</span>
                                <TrendingUp className="w-10 h-10 text-orange-500" strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
                                <p className={cn("text-3xl font-bold", comparisonStats.deviationPercent > 0 ? "text-red-500" : "text-emerald-500")}>
                                    {comparisonStats.deviationPercent > 0 ? '+' : ''}{comparisonStats.deviationPercent.toFixed(1)}%
                                </p>
                                <span className="text-gray-400 text-sm mb-1.5">({formatMoney(comparisonStats.avgDaily)}/day)</span>
                            </div>
                        </div>
                    </div>
                </div>



                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Biggest Spends */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="font-bold text-lg text-gray-900 mb-4">Biggest Spends</h3>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                            {tripStats.biggestSpends.map((t: any) => {
                                const Icon = getCategoryIcon(t.category);
                                const color = stringToColor(t.category);
                                const tagName = (Array.isArray(t.tags) && t.tags.length > 0)
                                    ? t.tags[0]
                                    : (typeof t.tags === 'string' ? t.tags : (t.note || t.category));

                                return (
                                    <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 truncate">{tagName}</p>
                                            <p className="text-xs text-gray-500">{t.category}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-gray-900 whitespace-nowrap">
                                                {formatMoney(Math.abs(t.amount))}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {formatDate(t.date)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {tripStats.biggestSpends.length === 0 && (
                                <p className="text-gray-400 text-sm text-center py-4">No huge expenses yet</p>
                            )}
                        </div>
                    </div>

                    {/* Detailed Breakdown */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="font-bold text-lg text-gray-900 mb-4">Spending Breakdown</h3>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                            {tripStats.byCategory.map((item: any) => {
                                const Icon = getCategoryIcon(item.name);
                                const color = stringToColor(item.name);
                                return (
                                    <div
                                        key={item.name}
                                        className={cn(
                                            "flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer border border-transparent hover:bg-gray-50",
                                            filterCategory === item.name ? "bg-emerald-50 border-emerald-200 shadow-sm" : "",
                                            filterCategory && filterCategory !== item.name ? "opacity-40 hover:opacity-100" : ""
                                        )}
                                        onClick={() => setFilterCategory(filterCategory === item.name ? null : item.name)}
                                    >
                                        {/* Icon - Same size as Biggest Spends (w-10 h-10) */}
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors", color.bg, color.text, filterCategory === item.name ? "ring-2 ring-emerald-500/20" : "")}>
                                            <Icon className="w-5 h-5" />
                                        </div>

                                        <div className="flex-1 min-w-0 space-y-1.5">
                                            <div className="flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-gray-900 truncate" title={item.name}>{item.name}</span>
                                                    <span className="text-gray-400 text-xs whitespace-nowrap">({Math.round(item.percentage)}%)</span>
                                                </div>
                                                <span className="font-bold text-gray-900 whitespace-nowrap ml-2">{formatMoney(item.amount)}</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{
                                                        width: `${item.widthPercentage}%`,
                                                        backgroundColor: color.hex
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Daily Activity Chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden mb-6">
                    <h3 className="font-bold text-lg text-gray-900 mb-6">Daily Activity</h3>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tripStats.dailySpending} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                                    axisLine={false}
                                    tickLine={false}
                                    dy={10}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f9fafb' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any) => [formatMoney(Number(value || 0)), 'Spent']}
                                />
                                <Bar
                                    dataKey="amount"
                                    radius={[8, 8, 0, 0]}
                                    onClick={(data: any) => setFilterDate(filterDate === data.fullDate ? null : data.fullDate)}
                                    className="cursor-pointer"
                                >
                                    {tripStats.dailySpending.map((entry: any, index: number) => {
                                        const maxAmount = Math.max(...tripStats.dailySpending.map((d: any) => d.amount), 1);
                                        let opacity = 0.3 + (Number(entry.amount) / maxAmount) * 0.7;

                                        // If date filter is active, dim non-selected bars
                                        if (filterDate && filterDate !== entry.fullDate) {
                                            opacity = 0.1;
                                        }
                                        // If this is the selected bar, make it full opacity and maybe a distinct color/border?
                                        // For now, opacity is good enough, maybe ensure selected is fully opaque.
                                        if (filterDate && filterDate === entry.fullDate) {
                                            opacity = 1;
                                        }

                                        return (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill="#10b981"
                                                fillOpacity={opacity}
                                                stroke={filterDate === entry.fullDate ? "#047857" : "none"}
                                                strokeWidth={2}
                                            />
                                        );
                                    })}
                                    <LabelList
                                        dataKey="amount"
                                        position="top"
                                        formatter={(value: any) => formatMoney(Number(value || 0))}
                                        style={{ fontSize: '10px', fill: '#6b7280', fontWeight: 500 }}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <h3 className="font-bold text-lg text-gray-900">Trip Transactions</h3>
                            {(filterDate || filterCategory) && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {filterDate && (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium border border-emerald-100">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(filterDate)}
                                            <button onClick={() => setFilterDate(null)} className="hover:text-emerald-900"><X className="w-3 h-3" /></button>
                                        </span>
                                    )}
                                    {filterCategory && (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            {filterCategory}
                                            <button onClick={() => setFilterCategory(null)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                                        </span>
                                    )}
                                    <button
                                        onClick={() => { setFilterDate(null); setFilterCategory(null); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                                    >
                                        Clear all
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={tripTxSearchQuery}
                                onChange={(e) => setTripTxSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                            />
                        </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {filteredTripTransactions.map(t => {
                            const isExcluded = selectedTrip.excludedTransactionIds.includes(t.id);
                            const Icon = getCategoryIcon(t.category);
                            const color = stringToColor(t.category);
                            const tagName = (Array.isArray(t.tags) && t.tags.length > 0)
                                ? t.tags[0]
                                : (typeof t.tags === 'string' ? t.tags : (t.note || t.category));

                            return (
                                <div key={t.id} className={cn("flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer group", isExcluded && "opacity-60 bg-gray-50/50")} onClick={() => toggleTransactionExclusion(t.id)}>
                                    <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-all flex-shrink-0", isExcluded ? "border-gray-300 bg-transparent" : "border-emerald-500 bg-emerald-500")}>
                                        {!isExcluded && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                    </div>

                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color.bg, color.text, isExcluded && "grayscale opacity-70")}>
                                        <Icon className="w-5 h-5" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={cn("font-bold truncate", isExcluded ? "text-gray-500 line-through" : "text-gray-900")}>{tagName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="font-medium text-gray-600">{t.category}</span>
                                            <span>•</span>
                                            <span>{formatDate(t.date)}</span>
                                            <span>•</span>
                                            <span className="truncate max-w-[100px]" title={t.account}>{t.account}</span>
                                        </div>
                                    </div>

                                    <div className="text-right whitespace-nowrap">
                                        <div className={cn("font-bold text-base", isExcluded ? "text-gray-400 line-through" : "text-gray-900")}>
                                            {formatMoney(t.amount, t.currency)}
                                        </div>
                                        {t.originalCurrency && t.originalAmount && (
                                            <div className={cn("text-xs font-medium mt-0.5", isExcluded ? "text-gray-300 line-through" : "text-gray-500")}>
                                                {formatMoney(t.originalAmount, t.originalCurrency)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {tripStats.allTripTransactions.length === 0 && (
                            <div className="p-8 text-center text-gray-400">No transactions found for these dates.</div>
                        )}
                    </div>
                </div>

                {/* Add Transaction Modal */}
                {isAddTransactionOpen && createPortal(
                    <div className="fixed inset-0 z-[100] overflow-y-auto">
                        <div className="min-h-full flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={() => setIsAddTransactionOpen(false)} />
                            <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-none">
                                    <h3 className="text-lg font-bold text-gray-900">Add Transaction</h3>
                                    <button onClick={() => setIsAddTransactionOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-4 flex-none border-b border-gray-100 flex flex-col gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Search by category, note, amount..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 pb-1">
                                        <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                                            <button
                                                onClick={() => setSearchQuery(selectedTrip.name)}
                                                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap flex-shrink-0"
                                            >
                                                {selectedTrip.name}
                                            </button>
                                            {(settings.preferences.customSearchTags || ['Travel', 'Hotels', 'Flights']).map((tag: string) => (
                                                <div key={tag} className="flex items-center bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 group">
                                                    <button
                                                        onClick={() => setSearchQuery(tag)}
                                                        className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors whitespace-nowrap border-r border-transparent group-hover:border-gray-200"
                                                    >
                                                        {tag}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const currentTags = settings.preferences.customSearchTags || ['Travel', 'Hotels', 'Flights'];
                                                            const newTags = currentTags.filter(t => t !== tag);
                                                            updatePreferences({ customSearchTags: newTags });
                                                        }}
                                                        className="px-1.5 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                        title="Remove tag"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {searchQuery && !(settings.preferences.customSearchTags || ['Travel', 'Hotels', 'Flights']).includes(searchQuery) && (
                                            <button
                                                onClick={() => {
                                                    const currentTags = settings.preferences.customSearchTags || ['Travel', 'Hotels', 'Flights'];
                                                    updatePreferences({ customSearchTags: [...currentTags, searchQuery] });
                                                }}
                                                className="flex-none px-2 py-1 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
                                                title="Save as tag"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin bg-gray-50/30">
                                    {searchResults.map(t => {
                                        const Icon = getCategoryIcon(t.category);
                                        const color = stringToColor(t.category);
                                        const tagName = (Array.isArray(t.tags) && t.tags.length > 0)
                                            ? t.tags[0]
                                            : (typeof t.tags === 'string' ? t.tags : (t.note || t.category));

                                        return (
                                            <div key={t.id} className="bg-white p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 shadow-sm hover:shadow-md transition-all group flex items-center gap-3">
                                                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                                                    <Icon className="w-5 h-5" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-bold text-gray-900 truncate">{tagName}</span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span className="font-medium text-gray-600">
                                                            {t.category}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="">{formatDate(t.date)}</span>
                                                        <span>•</span>
                                                        <span className="truncate max-w-[80px]" title={t.account}>
                                                            {t.account}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className="font-bold text-gray-900 whitespace-nowrap">{formatMoney(t.amount, t.currency)}</div>
                                                </div>

                                                <div className="flex items-center pl-1">
                                                    <button
                                                        onClick={() => handleAddExistingTransaction(t.id)}
                                                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        title="Add to Trip"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {searchResults.length === 0 && (
                                        <div className="text-center py-12 flex flex-col items-center text-gray-400">
                                            <Search className="w-12 h-12 mb-3 opacity-20" />
                                            <p>No transactions found matching your criteria</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    }

    // -- RENDER: MAIN LIST VIEW (REDESIGNED) --
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-emerald-100 font-medium text-lg mb-2 flex items-center gap-2">
                            <Calculator className="w-5 h-5" />
                            Travel Insights
                        </h2>
                        <div className="text-4xl font-bold tracking-tight mb-2">
                            Trip Analytics
                        </div>
                        <p className="text-emerald-100 max-w-xl">
                            Track your travel expenses separately. Compare spending habits abroad versus at home.
                        </p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 min-w-[200px]">
                        <div className="text-xs text-emerald-200 uppercase tracking-wider font-semibold mb-1">Total Trip Spending</div>
                        <div className="text-3xl font-bold text-white">
                            {formatMoney(allTripsTotalCost)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Plane className="w-5 h-5 text-gray-500" />
                    My Trips ({trips.length})
                </h3>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add Trip
                </button>
            </div>

            {/* Create Trip Modal */}
            {isCreating && createPortal(
                <div className="fixed inset-0 z-[100] overflow-y-auto">
                    <div className="min-h-full flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={() => setIsCreating(false)} />
                        <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl p-8 animate-in zoom-in-95 duration-200">
                            <h3 className="text-2xl font-bold text-gray-900 mb-6">Plan a New Trip</h3>
                            <form onSubmit={handleCreateTrip} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Trip Name</label>
                                    <input
                                        type="text"
                                        value={newTripName}
                                        onChange={(e) => setNewTripName(e.target.value)}
                                        placeholder="e.g. Summer Vacation"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400 font-medium"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                                        <input
                                            type="date"
                                            value={newTripStart}
                                            onChange={(e) => setNewTripStart(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium font-sans"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                                        <input
                                            type="date"
                                            value={newTripEnd}
                                            onChange={(e) => setNewTripEnd(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium font-sans"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-4 mt-8">
                                    <button
                                        type="button"
                                        onClick={() => { setIsCreating(false); resetForm(); }}
                                        className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                                    >
                                        Create Trip
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Trips Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trips.map(trip => {
                    const start = trip.startDate;
                    const end = trip.endDate;
                    const additionalIds = trip.additionalTransactionIds || [];
                    const activeTransactions = transactions.filter(t => {
                        const txDate = t.date.split('T')[0];
                        const inRange = txDate >= start && txDate <= end && t.type === 'expense';
                        const isAdditional = additionalIds.includes(t.id);
                        return (inRange || isAdditional) && !trip.excludedTransactionIds.includes(t.id);
                    });
                    const totalCost = activeTransactions.reduce((sum, t) => sum + t.amount, 0);
                    const startDate = new Date(start);
                    const endDate = new Date(end);
                    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
                    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                    return (
                        <div
                            key={trip.id}
                            onClick={() => setSelectedTrip(trip)}
                            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-all duration-300 group cursor-pointer relative"
                        >
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                        <Plane className="w-6 h-6" />
                                    </div>
                                    <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-600">
                                        {days} Days
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
                                    {trip.name}
                                </h3>

                                <div className="text-2xl font-bold text-gray-900 mb-6">
                                    {formatMoney(totalCost)}
                                </div>

                                <div className="mt-auto space-y-3">
                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <div className="text-xs text-gray-400">Date Range</div>
                                            <div className="font-semibold text-gray-900 text-sm">
                                                {formatDate(startDate)} - {formatDate(endDate)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center bg-white">
                                    <div className="text-xs text-gray-400">
                                        {activeTransactions.length} transactions
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteTrip(trip.id, e)}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                        title="Delete Trip"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {trips.length === 0 && !isCreating && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                        <Map className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">No trips planned yet</p>
                        <p className="text-sm">Create your first trip to start tracking expenses.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
