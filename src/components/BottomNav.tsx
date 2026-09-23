import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Wallet, Menu, X, PieChart, Import, LogOut, Heart, LineChart, Map, Banknote, ArrowRightLeft, Globe, Settings, Eye, EyeOff, Upload, Repeat, Milestone } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePrivacy } from '../contexts/PrivacyContext';
import menuIllustration from '../assets/menu-illustration.png';

// This component will be used in App.tsx
export function BottomNav({ onReset, onImport }: { onReset: () => void; onImport: () => void }) {
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

    // Lock body scroll when menu is open
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isMenuOpen]);

    const navItems = [
        { path: '/', label: 'Overview', icon: LayoutDashboard },
        { path: '/trends', label: 'Trends', icon: LineChart },
        { path: '/accounts', label: 'Wallets', icon: Wallet },
    ];

    // Mirrors the desktop Navigation groups (minus the three pinned above).
    const menuSections = [
        {
            title: 'Analytics',
            items: [
                { path: '/category-insights', label: 'Expenses', icon: PieChart },
                { path: '/income-insights', label: 'Income', icon: TrendingUp },
                { path: '/paycheck', label: 'Paycheck', icon: Banknote },
                { path: '/milestones', label: 'Milestones', icon: Milestone },
                { path: '/recurring', label: 'Recurring', icon: Repeat },
                { path: '/trip-analytics', label: 'Trips', icon: Map },
                { path: '/travel-index', label: 'Travel Index', icon: Globe },
                { path: '/currency-rates', label: 'Currency Rates', icon: ArrowRightLeft },
            ]
        },
        {
            title: 'Planning & Tools',
            items: [
                { path: '/wishlist', label: 'Goals', icon: Heart },
                { path: '/ai-export', label: 'AI Sync', icon: Import },
                { path: '/settings', label: 'Settings', icon: Settings },
            ]
        }
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
                                aria-label={item.label}
                                className={cn(
                                    "flex flex-col items-center justify-center w-full h-full space-y-1 rounded-full transition-all active:scale-95",
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
                        aria-label="Menu"
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-full space-y-1 rounded-full transition-all active:scale-95",
                            isMenuOpen ? "text-emerald-600 bg-emerald-50/50" : "text-gray-400 hover:text-gray-900"
                        )}
                    >
                        <Menu className={cn("w-5 h-5 transition-transform", isMenuOpen && "scale-110")} />
                    </button>
                </div>
            </nav>

            {isMenuOpen && (
                <div className="fixed inset-0 bg-white z-[60] md:hidden animate-in fade-in slide-in-from-bottom duration-200">
                    <div className="p-4 flex flex-col h-full overflow-y-auto pb-safe">
                        <div className="flex items-center justify-between mt-12 mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Menu</h2>
                            <div className="flex items-center gap-2">
                                {/* Privacy toggle lives in the header on desktop only, so expose it here. */}
                                <button
                                    onClick={togglePrivacyMode}
                                    aria-pressed={isPrivacyMode}
                                    className={cn(
                                        "p-2 rounded-full transition-colors",
                                        isPrivacyMode ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                                    )}
                                    title={isPrivacyMode ? "Show sensitive data" : "Hide sensitive data"}
                                >
                                    {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                                <button onClick={() => setIsMenuOpen(false)} aria-label="Close menu" className="p-2 bg-gray-100 rounded-full">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-5">
                            {menuSections.map(section => (
                                <div key={section.title} className="space-y-2">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{section.title}</h3>
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = location.pathname === item.path;
                                        return (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                onClick={() => setIsMenuOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 p-3.5 rounded-xl transition-colors",
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
                            ))}
                        </div>

                        <div className="pt-4 mt-2 space-y-2">
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onImport();
                                }}
                                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                            >
                                <div className="p-2 bg-white rounded-lg">
                                    <Upload className="w-5 h-5" />
                                </div>
                                Import statement
                            </button>
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onReset();
                                }}
                                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors"
                            >
                                <div className="p-2 bg-white rounded-lg">
                                    <LogOut className="w-5 h-5" />
                                </div>
                                Clear imported data
                            </button>
                        </div>

                        {/* Decorative Illustration - Fixed size to prevent scrolling */}
                        <div className="mt-4 mb-8 flex justify-center opacity-90 animate-in fade-in zoom-in duration-1000">
                            <img
                                src={menuIllustration}
                                alt="Financial Growth"
                                className="w-28 h-28 object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
