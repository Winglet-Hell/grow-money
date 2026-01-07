import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Wallet, Menu, X, PieChart, Import, LogOut, Heart } from 'lucide-react';
import { cn } from '../lib/utils';

// This component will be used in App.tsx
export function BottomNav({ onReset }: { onReset: () => void }) {
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navItems = [
        { path: '/', label: 'Home', icon: LayoutDashboard },
        { path: '/trends', label: 'Trends', icon: TrendingUp },
        { path: '/accounts', label: 'Accounts', icon: Wallet },
    ];

    const menuItems = [
        { path: '/category-insights', label: 'Category Insights', icon: PieChart },
        { path: '/income-insights', label: 'Income Insights', icon: PieChart }, // Reusing PieChart for now
        { path: '/wishlist', label: 'Wishlist', icon: Heart },
        { path: '/ai-export', label: 'AI Export', icon: Import },
    ];

    return (
        <>
            {/* Height spacer to prevent content from being hidden behind the fixed nav */}
            <div className="h-16 md:hidden" />

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-8 left-6 right-6 bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-full z-50 md:hidden ring-1 ring-black/5">
                <div className="flex justify-around items-center h-16">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex flex-col items-center justify-center w-full h-full space-y-1 rounded-xl transition-all active:scale-95",
                                    isActive ? "text-emerald-600 bg-emerald-50/50" : "text-gray-400 hover:text-gray-900"
                                )}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                            </Link>
                        );
                    })}

                    {/* Menu Button */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-full space-y-1 rounded-xl transition-all active:scale-95",
                            isMenuOpen ? "text-emerald-600 bg-emerald-50/50" : "text-gray-400 hover:text-gray-900"
                        )}
                    >
                        <Menu className={cn("w-5 h-5 transition-transform", isMenuOpen && "scale-110")} />
                    </button>
                </div>
            </nav>

            {isMenuOpen && (
                <div className="fixed inset-0 bg-white z-40 md:hidden animate-in fade-in slide-in-from-bottom duration-200 pb-24">
                    <div className="p-4 flex flex-col h-full overflow-y-auto pb-safe">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Menu</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-gray-100 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsMenuOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 p-4 rounded-xl transition-colors",
                                            isActive
                                                ? "bg-emerald-50 text-emerald-700 font-medium"
                                                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                                        )}
                                    >
                                        <div className={cn(
                                            "p-2 rounded-lg",
                                            isActive ? "bg-emerald-100" : "bg-white"
                                        )}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="mt-auto pt-8 border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onReset();
                                }}
                                className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors"
                            >
                                <div className="p-2 bg-white rounded-lg">
                                    <LogOut className="w-5 h-5" />
                                </div>
                                Reset Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
