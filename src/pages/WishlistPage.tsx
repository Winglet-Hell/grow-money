import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, AlertTriangle, CheckCircle2, ShoppingBag, Target } from 'lucide-react';
import { useAccounts } from '../hooks/useAccounts';
import { useFinancialMetrics } from '../hooks/useFinancialMetrics';
import type { Transaction } from '../types';
import { supabase } from '../lib/supabase';
import { usePrivacy } from '../contexts/PrivacyContext';

interface WishlistItem {
    id: string; // UUID from Supabase
    name: string;
    costRUB: number;
    priority: 'Low' | 'Medium' | 'High';
    imageURL?: string;
}

interface WishlistPageProps {
    transactions: Transaction[];
}

export function WishlistPage({ transactions }: WishlistPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { totalNetWorth } = useAccounts(transactions);
    const { monthlySavingPower } = useFinancialMetrics(transactions);
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch from Supabase
    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('wishlist')
            .select('*')
            .order('priority', { ascending: false }); // Initial sort, but we resort below

        if (error) {
            console.error('Error fetching wishlist:', error);
        } else if (data) {
            setItems(data);
        }
        setIsLoading(false);
    }

    const addItem = async (item: Omit<WishlistItem, 'id'>) => {
        try {
            const { data, error } = await supabase
                .from('wishlist')
                .insert([item])
                .select();

            if (error) throw error;

            if (data) {
                setItems(prev => [...prev, ...data]);
                setIsFormOpen(false);
            }
        } catch (error) {
            console.error('Failed to add item:', error);
        }
    };

    const deleteItem = async (id: string) => {
        try {
            const { error } = await supabase
                .from('wishlist')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setItems(prev => prev.filter(i => i.id !== id));
        } catch (error) {
            console.error('Failed to delete item:', error);
        }
    };

    const sortedItems = [...items].sort((a, b) => {
        // Sort: Available first, then by lower cost
        const aCanBuy = totalNetWorth >= a.costRUB;
        const bCanBuy = totalNetWorth >= b.costRUB;
        if (aCanBuy && !bCanBuy) return -1;
        if (!aCanBuy && bCanBuy) return 1;
        return a.costRUB - b.costRUB;
    });

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-yellow-500 to-amber-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-amber-100 font-medium text-lg mb-2 flex items-center gap-2">
                            <Target className="w-5 h-5" />
                            Smart Forecast
                        </h2>
                        <div className="text-4xl font-bold tracking-tight mb-2">
                            Your Dream Board
                        </div>
                        <p className="text-amber-100 max-w-xl">
                            Plan your future purchases. We calculate exactly when you can afford them based on your real saving habits.
                        </p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 min-w-[200px]">
                        <div className="text-xs text-amber-200 uppercase tracking-wider font-semibold mb-1">Monthly Saving Power</div>
                        <div className={`text-3xl font-bold ${monthlySavingPower < 0 ? 'text-red-200' : 'text-white'}`}>
                            {isPrivacyMode ? '••••••' : Math.floor(monthlySavingPower).toLocaleString('ru-RU')} RUB
                        </div>
                        {monthlySavingPower < 0 && (
                            <div className="text-xs text-red-100 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Expenses exceed Income
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-gray-500" />
                    Wishlist ({isLoading ? '...' : items.length})
                </h3>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add Goal
                </button>
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Goal</h3>
                        <WishlistForm onSubmit={addItem} onCancel={() => setIsFormOpen(false)} />
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedItems.map(item => (
                    <WishlistCard
                        key={item.id}
                        item={item}
                        netWorth={totalNetWorth}
                        savingPower={monthlySavingPower}
                        onDelete={deleteItem}
                        isPrivacy={isPrivacyMode}
                    />
                ))}
                {sortedItems.length === 0 && !isLoading && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                        <ShoppingBag className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">Your wishlist is empty</p>
                        <p className="text-sm">Add your first dream to start forecasting!</p>
                    </div>
                )}
                {isLoading && (
                    <div className="col-span-full py-20 flex justify-center text-emerald-600">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
                    </div>
                )}
            </div>
        </div>
    );
}

function WishlistCard({ item, netWorth, savingPower, onDelete, isPrivacy }: { item: WishlistItem, netWorth: number, savingPower: number, onDelete: (id: string) => void, isPrivacy: boolean }) {
    const canBuyNow = netWorth >= item.costRUB;
    const gap = item.costRUB - netWorth;
    const monthsToGoalFromScratch = savingPower > 0 ? Math.ceil(item.costRUB / savingPower) : Infinity;

    // Scenario B: Gap / Saving Power (If we used all net worth, how long to close gap?)
    // Actually spec says: 
    // Scenario A: Cost / Monthly Saving Power. Result: "You will accumulate in X months" (Assuming simple accumulation from 0? or from now?)
    // Spec: "Сценарий А (From Scratch): Cost / Monthly Saving Power"
    // Spec: "Сценарий Б (Using Current Capital): Total Net Worth - Cost"

    // Let's interpret "From Scratch" as "If I had 0 money".
    // But for the user, "When can I buy it" usually means "From now". 
    // If NetWorth > Cost, I can buy now. 
    // If NetWorth < Cost, I need to save (Cost - NetWorth). 
    // Time to goal = (Cost - NetWorth) / SavingPower.

    // Spec says: "From Scratch result: 'You will accumulate in X months'".
    // Spec says: "Using Current Capital result: If < 0: 'Not enough yet. Gap: X. Time to close gap: Y months'".

    const timeToCloseGap = (gap > 0 && savingPower > 0) ? Math.ceil(gap / savingPower) : Infinity;

    const estimatedDate = new Date();
    if (timeToCloseGap !== Infinity) {
        estimatedDate.setMonth(estimatedDate.getMonth() + timeToCloseGap);
    }

    const progress = Math.min(100, Math.max(0, (netWorth / item.costRUB) * 100));

    // Safety check for ID
    const handleDelete = () => {
        if (item.id !== undefined) {
            onDelete(item.id);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow group">
            {item.imageURL && (
                <div className="h-48 overflow-hidden bg-gray-100 relative">
                    <img src={item.imageURL} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    <div className="absolute bottom-3 left-4 text-white font-bold text-lg">{item.name}</div>
                </div>
            )}

            <div className="p-6 flex-1 flex flex-col">
                {!item.imageURL && (
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-gray-900">{item.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.priority === 'High' ? 'bg-red-100 text-red-600' :
                            item.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-600'
                            }`}>
                            {item.priority}
                        </span>
                    </div>
                )}

                {item.imageURL && (
                    <div className="flex justify-end -mt-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.priority === 'High' ? 'bg-red-100 text-red-600' :
                            item.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-600'
                            }`}>
                            {item.priority}
                        </span>
                    </div>
                )}

                <div className="text-2xl font-bold text-gray-900 mb-1">
                    {isPrivacy ? '••••••' : item.costRUB.toLocaleString('ru-RU')} <span className="text-sm font-normal text-gray-400">RUB</span>
                </div>

                {/* Progress */}
                <div className="mt-4 mb-6">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-medium text-emerald-600">{Math.floor(progress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${canBuyNow ? 'bg-emerald-500' : 'bg-amber-400'}`}
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                <div className="mt-auto space-y-3">
                    {canBuyNow ? (
                        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                                <CheckCircle2 className="w-5 h-5" />
                                Available NOW!
                            </div>
                            <div className="text-sm text-emerald-600">
                                You will have {isPrivacy ? '••••••' : (netWorth - item.costRUB).toLocaleString('ru-RU')} RUB left.
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {savingPower > 0 ? (
                                <div className="flex items-center gap-3 text-gray-600">
                                    <Calendar className="w-5 h-5 text-amber-500" />
                                    <div>
                                        <div className="text-xs text-gray-400">Estimated Date</div>
                                        <div className="font-semibold text-gray-900">
                                            {estimatedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                    <div className="ml-auto text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                                        {timeToCloseGap} mo
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                                    <div className="text-sm text-red-700">
                                        <strong>Impossible</strong> with current negative saving power. Reduce expenses first.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center">
                    <div className="text-xs text-gray-400">
                        From scratch: {monthsToGoalFromScratch !== Infinity ? monthsToGoalFromScratch : 'N/A'} mo
                    </div>
                    <button
                        onClick={handleDelete}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Delete Goal"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

function WishlistForm({ onSubmit, onCancel }: { onSubmit: (val: any) => void, onCancel: () => void }) {
    const [name, setName] = useState('');
    const [cost, setCost] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [imageURL, setImageURL] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            name,
            costRUB: Number(cost),
            priority,
            imageURL: imageURL || undefined
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal Name</label>
                <input
                    required
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="e.g. MacBook Pro"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost (RUB)</label>
                <input
                    required
                    type="number"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="150000"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <div className="flex gap-2">
                    {['Low', 'Medium', 'High'].map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setPriority(p)}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg border ${priority === p
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL (Optional)</label>
                <input
                    type="text"
                    value={imageURL}
                    onChange={e => setImageURL(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="https://..."
                />
            </div>
            <div className="flex gap-3 mt-6">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                >
                    Add Goal
                </button>
            </div>
        </form>
    );
}
