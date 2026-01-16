
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    PieChart,
    TrendingUp,
    LineChart,
    Wallet,
    Heart,
    Import,
    ChevronDown,
    Map,
    Eye,
    EyeOff,
    Layout,
    BarChart3,
    Calendar,
    Wrench
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { usePrivacy } from '../contexts/PrivacyContext';

// Define navigation structure
const NAV_CATEGORIES = [
    {
        title: 'Overview',
        icon: Layout,
        items: [
            { path: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Financial snapshot' },
        ]
    },
    {
        title: 'Analytics',
        icon: BarChart3,
        items: [
            { path: '/category-insights', label: 'Expenses', icon: PieChart, description: 'Spending breakdown' },
            { path: '/income-insights', label: 'Income', icon: TrendingUp, description: 'Revenue analysis' },
            { path: '/trends', label: 'Trends', icon: LineChart, description: 'Historical data' },
            { path: '/trip-analytics', label: 'Trip Analytics', icon: Map, description: 'Travel spending' },
        ]
    },
    {
        title: 'Planning',
        icon: Calendar,
        items: [
            { path: '/accounts', label: 'Wallets', icon: Wallet, description: 'Manage accounts' },
            { path: '/wishlist', label: 'Goals', icon: Heart, description: 'Savings & Goals' },
        ]
    },
    {
        title: 'Tools',
        icon: Wrench,
        items: [
            { path: '/ai-export', label: 'AI Export', icon: Import, description: 'Export for AI' },
        ]
    }
];

interface NavigationProps {
    onReset?: () => void;
    isAuthenticated?: boolean;
    onSignIn?: () => void;
    onLogout?: () => void;
    userEmail?: string;
    isLandingPage?: boolean;
}

export function Navigation({ onReset, isAuthenticated, onSignIn, onLogout, userEmail, isLandingPage = false }: NavigationProps) {
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const { settings } = useUserSettings();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

    const handleMouseEnter = (categoryTitle: string) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setActiveCategory(categoryTitle);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setActiveCategory(null);
        }, 150); // Small delay to prevent flickering
    };

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <header className={cn(
            "fixed top-0 inset-x-0 z-50 h-16 transition-all duration-500 rounded-b-3xl",
            !isLandingPage ? "bg-white/80 backdrop-blur-md border-b border-gray-200/50" : "bg-transparent border-transparent"
        )}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">

                {/* Logo */}
                <div className="flex-none flex items-center z-20">
                    <Link to="/" className="flex items-center gap-2 group cursor-pointer" onClick={onReset}>
                        <div className="bg-white/40 border border-white/60 p-2 rounded-xl backdrop-blur-md shadow-sm group-hover:bg-white/60 transition-colors">
                            <LayoutDashboard className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight text-emerald-950 hidden sm:block">
                            Grow <span className="text-emerald-600">money</span>
                        </h1>
                    </Link>
                </div>

                {/* Desktop Navigation */}
                {isAuthenticated && (
                    <nav className="hidden md:flex items-center justify-center flex-1 h-full">
                        <ul className="flex items-center gap-1 h-full">
                            {NAV_CATEGORIES.map((category) => {
                                const isActive = activeCategory === category.title;
                                const isCurrentRoute = category.items.some(item => item.path === location.pathname);

                                return (
                                    <li
                                        key={category.title}
                                        className="relative h-full flex items-center"
                                        onMouseEnter={() => handleMouseEnter(category.title)}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        <button
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                                isCurrentRoute
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                                                isActive && "text-gray-900 bg-gray-50"
                                            )}
                                        >
                                            <category.icon className={cn("w-4 h-4", isCurrentRoute ? "text-emerald-600" : "text-gray-400 group-hover:text-gray-600")} />
                                            {category.title}
                                            <ChevronDown className={cn("w-3 h-3 transition-transform duration-200 opacity-50", isActive ? "rotate-180" : "")} />
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div
                                            className={cn(
                                                "absolute top-full left-1/2 -translate-x-1/2 pt-2 w-[280px] transition-all duration-200 origin-top-center",
                                                isActive
                                                    ? "opacity-100 visible translate-y-0 scale-100"
                                                    : "opacity-0 invisible -translate-y-2 scale-95 pointer-events-none"
                                            )}
                                        >
                                            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-2 overflow-hidden ring-1 ring-black/5">
                                                <div className="relative">
                                                    {/* Decorative arrow */}
                                                    <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-l border-t border-gray-100" />

                                                    <div className="relative bg-white flex flex-col gap-1">
                                                        {category.items.map((item) => (
                                                            <Link
                                                                key={item.path}
                                                                to={item.path}
                                                                className={cn(
                                                                    "group flex items-start gap-3 p-3 rounded-lg transition-colors",
                                                                    location.pathname === item.path
                                                                        ? "bg-emerald-50"
                                                                        : "hover:bg-gray-50"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "p-2 rounded-lg transition-colors",
                                                                    location.pathname === item.path
                                                                        ? "bg-emerald-100 text-emerald-600"
                                                                        : "bg-gray-100 text-gray-500 group-hover:bg-white group-hover:shadow-sm group-hover:text-emerald-600"
                                                                )}>
                                                                    <item.icon className="w-5 h-5" />
                                                                </div>
                                                                <div>
                                                                    <div className={cn(
                                                                        "text-sm font-medium",
                                                                        location.pathname === item.path ? "text-emerald-900" : "text-gray-900"
                                                                    )}>
                                                                        {item.label}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 line-clamp-1">
                                                                        {item.description}
                                                                    </div>
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                )}

                {/* Mobile Menu Button - Removed as per user request */}
                {/* {isAuthenticated && (
                    <button
                        className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg ml-auto mr-2"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                )} */}


                {/* User Menu & Auth */}
                <div className="flex-none flex items-center gap-2">
                    {isAuthenticated && (
                        <button
                            onClick={togglePrivacyMode}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors hidden sm:block"
                            title={isPrivacyMode ? "Show sensitive data" : "Hide sensitive data"}
                        >
                            {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    )}

                    {!isAuthenticated ? (
                        <button
                            onClick={onSignIn}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap"
                        >
                            Sign In
                        </button>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                className="flex items-center gap-2 px-1.5 py-1.5 md:px-3 md:py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                            >
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 overflow-hidden ring-2 ring-transparent hover:ring-emerald-200 transition-all">
                                    {settings?.profile?.avatar_icon ? (
                                        (() => {
                                            const IconComponent = (Icons as any)[settings.profile.avatar_icon] || Icons.User;
                                            return <IconComponent className="w-4 h-4" />;
                                        })()
                                    ) : (
                                        userEmail ? userEmail[0].toUpperCase() : <Wallet className="w-4 h-4" />
                                    )}
                                </div>
                                <span className="hidden lg:block max-w-[100px] truncate">
                                    {settings?.profile?.full_name || userEmail?.split('@')[0]}
                                </span>
                                <ChevronDown className="w-4 h-4 text-gray-400 hidden lg:block" />
                            </button>

                            {/* User Dropdown */}
                            {isUserMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsUserMenuOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-40 animate-in fade-in zoom-in-95 duration-200">
                                        <Link
                                            to="/settings"
                                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                            onClick={() => setIsUserMenuOpen(false)}
                                        >
                                            Settings
                                        </Link>
                                        <button
                                            onClick={() => {
                                                setIsUserMenuOpen(false);
                                                onReset?.();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                            Clear Data
                                        </button>
                                        <div className="h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={() => {
                                                setIsUserMenuOpen(false);
                                                onLogout?.();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Menu Content */}
            {mobileMenuOpen && isAuthenticated && (
                <div className="md:hidden fixed inset-x-0 top-16 bottom-0 bg-white z-40 overflow-y-auto border-t border-gray-100 animate-in slide-in-from-top-5">
                    <div className="p-4 space-y-6">
                        {NAV_CATEGORIES.map((category) => (
                            <div key={category.title} className="space-y-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 flex items-center gap-2">
                                    <category.icon className="w-3.5 h-3.5" />
                                    {category.title}
                                </h3>
                                <div className="space-y-1">
                                    {category.items.map((item) => (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                                                location.pathname === item.path
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "text-gray-700 hover:bg-gray-50"
                                            )}
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <item.icon className="w-5 h-5 opacity-70" />
                                            <span className="font-medium">{item.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </header>
    );
}
