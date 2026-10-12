import {
    ShoppingCart,
    Car,
    Utensils,
    Home,
    Zap,
    Coffee,
    Plane,
    ShoppingBag,
    Dumbbell,
    Stethoscope,
    GraduationCap,
    Gamepad2,
    Gift,
    Smartphone,
    Wifi,
    Fuel,
    Bus,
    Train,
    Briefcase,
    Music,
    Film,
    Book,
    Shirt,
    Scissors,
    Baby,
    Dog,
    Hammer,
    Landmark,
    RefreshCw,
    Truck,
    Map,
    Smile,
    CreditCard,
    DollarSign,
    PiggyBank,
    Hotel,
    Wallet,
    TrendingUp,
    Repeat,
    Receipt,
    ShieldCheck,
    CircleEllipsis,
    HandCoins,
    ShoppingBasket,
    Hamburger,
    Motorbike,
    TrainFront,
    PlaneTakeoff,
    SprayCan,
    RefreshCcwDot,
    PhoneCall,
    Ticket,
    Balloon,
    CircleQuestionMark,
    SoapDispenserDroplet,
    HeartPulse,
    ShieldPlus,
    Coins,
    FileCog,
    Percent,
    BadgeDollarSign,
    Handshake,
    Tag,
    type LucideIcon
} from 'lucide-react';
import type { Transaction } from '../types';
import { stringToColor, type ColorSet } from './utils';

const ICON_MAP: Record<string, LucideIcon> = {
    // Food & Drink - Each category gets unique icon
    'groceries': ShoppingCart,       // 🛒 Groceries
    'dining out': Utensils,          // 🍴 Dining Out
    'diningout': Utensils,
    'food': Coffee,                   // ☕ General Food
    'restaurant': Utensils,
    'cafe': Coffee,
    'coffee': Coffee,
    'bar': Coffee,
    'supermarket': ShoppingCart,
    'products': ShoppingCart,
    'продукты': ShoppingCart,
    'еда': Coffee,
    'ресторан': Utensils,
    'кафе': Coffee,

    // Transport - Each category gets unique icon
    'transport': Car,                 // 🚗 Transport
    'taxi': Car,
    'uber': Car,
    'bus': Bus,
    'train': Train,
    'subway': Train,
    'metro': Train,
    'fuel': Fuel,
    'gas': Fuel,
    'petrol': Fuel,
    'parking': Car,
    'такси': Car,
    'транспорт': Car,
    'бензин': Fuel,

    // Shopping - Each category gets unique icon
    'shopping': ShoppingBag,          // 🛍️ Shopping
    'clothes': Shirt,
    'clothing': Shirt,
    'fashion': Shirt,
    'shoes': Shirt,
    'electronics': Smartphone,
    'gadgets': Smartphone,
    'одежда': Shirt,
    'покупки': ShoppingBag,

    // Housing & Utilities - Each category gets unique icon
    'rent': Home,                     // 🏠 Rent
    'housing': Home,
    'mortgage': Home,
    'utilities': Zap,                 // ⚡ Utilities
    'utility bills': Receipt,         // 🧾 Utility Bills
    'bills': Receipt,
    'electricity': Zap,
    'water': Zap,
    'internet': Wifi,
    'phone': Smartphone,
    'mobile': Smartphone,
    'дом': Home,
    'коммуналка': Zap,

    // Health & Fitness - Each category gets unique icon
    'healthcare': Stethoscope,        // 🩺 Healthcare
    'health': Stethoscope,
    'medical': Stethoscope,
    'doctor': Stethoscope,
    'pharmacy': Stethoscope,
    'drugs': Stethoscope,
    'fitness': Dumbbell,
    'gym': Dumbbell,
    'sports': Dumbbell,
    'здоровье': Stethoscope,
    'аптека': Stethoscope,
    'спорт': Dumbbell,

    // Entertainment & Leisure - Each category gets unique icon
    'entertainment': Gamepad2,        // 🎮 Entertainment
    'games': Gamepad2,
    'gaming': Gamepad2,
    'movies': Film,
    'cinema': Film,
    'music': Music,
    'spotify': Music,
    'books': Book,
    'развлечения': Gamepad2,
    'кино': Film,

    // Travel - Each category gets unique icon
    'travel': Plane,                  // ✈️ Travel
    'flight': Plane,
    'hotel': Hotel,
    'vacation': Plane,
    'путешествия': Plane,

    // Education - Each category gets unique icon
    'education': GraduationCap,       // 🎓 Education
    'course': GraduationCap,
    'school': GraduationCap,
    'university': GraduationCap,
    'обучение': GraduationCap,

    // Personal Care
    'beauty': Scissors,
    'hair': Scissors,
    'salon': Scissors,
    'barber': Scissors,
    'красота': Scissors,

    // Kids & Pets
    'kids': Baby,
    'baby': Baby,
    'child': Baby,
    'pets': Dog,
    'dog': Dog,
    'cat': Dog,
    'vet': Stethoscope,
    'дети': Baby,
    'животные': Dog,

    // Income/Financial - Each category gets unique icon
    'salary': DollarSign,             // 💵 Salary
    'wages': DollarSign,
    'bonus': Gift,                    // 🎁 Bonus
    'freelance': Briefcase,           // 💼 Freelance
    'investment': TrendingUp,         // 📈 Investment
    'investing': TrendingUp,
    'savings': PiggyBank,             // 🐷 Savings
    'transfer': CreditCard,           // 💳 Transfer
    'зарплата': DollarSign,
    'перевод': CreditCard,

    // Subscription - Unique icon
    'subscription': RefreshCw,        // 🔄 Subscription
    'subscriptions': RefreshCw,

    // Tools/Services
    'services': Hammer,
    'maintenance': Hammer,
    'repair': Hammer,
    'ремонт': Hammer,

    // Specific User Requests
    'hotels': Hotel,
    'flights': Plane,
    'flighsts': Plane, // typo coverage
    'visa': GraduationCap, // Study & Visa
    'study': GraduationCap,
    'tech': Smartphone,
    'marketplace': ShoppingBag,
    'market': ShoppingBag,
    'excursions': Map,
    'leisure': Smile,
    'delivery': Truck,
    'retail': ShoppingBag,
    'trip': Plane,
    'gifts': Gift,
    'gift': Gift,
    'подар': Gift,
    'taxes': Landmark,
    'insurance': ShieldCheck,
    'страхов': ShieldCheck,
    // A bucket for the rest, not a missing icon (the source app's own "Other" is in CATEGORY_LOOKS).
    'other': CircleEllipsis,
    'прочее': CircleEllipsis,
    'другое': CircleEllipsis,

    // Income Specific
    'paycheck': DollarSign,
    'oretex': Wallet,
    'addrea': Wallet,
    'refund': Repeat,
};

// How the source app shows each category — its icon and colour, read off its category screens
// in October 2026 — so a category looks the same in both apps. The export carries neither, so
// this is kept by hand; a category missing here gets a keyword icon and a colour from its name.
// The chip is the app's colour at 15% on white, the icon that colour darkened only as far as
// 4.5:1 on the chip needs (the app's own colour is in the comment). Charts use the same ink.
type CategoryLook = { icon: LucideIcon; color: ColorSet };

const look = (icon: LucideIcon, bg: string, text: string): CategoryLook =>
    ({ icon, color: { bg, text, hex: text.slice('text-['.length, -1) } });

const CATEGORY_LOOKS: Record<string, CategoryLook> = {
    // Expenses
    'groceries': look(ShoppingBasket, 'bg-[#fff0d9]', 'text-[#9c5f02]'),                // #fc9904
    'eating out': look(Utensils, 'bg-[#fdf7da]', 'text-[#847004]'),                     // #f0cc07
    'food delivery': look(Hamburger, 'bg-[#fbe3d9]', 'text-[#bd3803]'),                 // #e44404
    'grocery delivery': look(Motorbike, 'bg-[#fdf3da]', 'text-[#8f6805]'),              // #f2b108
    'local transport': look(TrainFront, 'bg-[#dbebf7]', 'text-[#0d6bb8]'),              // #0e77cc
    'intercity transport': look(PlaneTakeoff, 'bg-[#e2e4fc]', 'text-[#3b4de9]'),        // #3b4de9
    'accommodation': look(Hotel, 'bg-[#dbe4ef]', 'text-[#0d4c96]'),                     // #0d4c96
    'travel packages': look(Briefcase, 'bg-[#e7f3ff]', 'text-[#3f71a3]'),               // #62b0ff
    'services': look(Hammer, 'bg-[#e9ece7]', 'text-[#5b7053]'),                         // #6a8261
    'household': look(SprayCan, 'bg-[#e3f8e5]', 'text-[#2a7d33]'),                      // #45cd54
    'utilities': look(Zap, 'bg-[#f2f6dc]', 'text-[#67750c]'),                           // #abc314
    'rent': look(Home, 'bg-[#dce9e2]', 'text-[#156d3b]'),                               // #156d3b
    'digital services': look(RefreshCcwDot, 'bg-[#e0f5fa]', 'text-[#1d778c]'),          // #2ebddf
    'phone & internet': look(PhoneCall, 'bg-[#dbefec]', 'text-[#0a776a]'),              // #0c9383
    'sightseeing': look(Ticket, 'bg-[#fbecf8]', 'text-[#975689]'),                      // #e281cd
    'leisure': look(Balloon, 'bg-[#ffdff2]', 'text-[#c12081]'),                         // #fe2aaa
    'other goods': look(ShoppingBag, 'bg-[#eeeafc]', 'text-[#725aba]'),                 // #8f70e8
    'clothing & shoes': look(Shirt, 'bg-[#e4dced]', 'text-[#4e1684]'),                  // #4e1684
    'electronics': look(Smartphone, 'bg-[#f0dbf8]', 'text-[#9e0ccf]'),                  // #9e0ccf
    'other': look(CircleQuestionMark, 'bg-[#fee1e1]', 'text-[#c52a2a]'),                // #f63534
    'personal care': look(SoapDispenserDroplet, 'bg-[#ebdbdf]', 'text-[#7c0c2b]'),      // #7c0c2b
    'health': look(HeartPulse, 'bg-[#f6dae2]', 'text-[#c60a3e]'),                       // #c60a3e
    'insurance': look(ShieldPlus, 'bg-[#ffeae8]', 'text-[#af4d45]'),                    // #fd7064
    'gifts & donations': look(Gift, 'bg-[#f2f2f2]', 'text-[#6e6e6e]'),                  // #a7a6a6
    'fees': look(Coins, 'bg-[#dedede]', 'text-[#242424]'),                              // #242424
    'visas & documents': look(FileCog, 'bg-[#f0eae1]', 'text-[#856531]'),               // #9b7539
    'taxes': look(Percent, 'bg-[#e0e2e2]', 'text-[#2f3c41]'),                           // #2f3c41
    // Income
    'oretex paycheck': look(BadgeDollarSign, 'bg-[#fee1e1]', 'text-[#c52a2a]'),         // #f63534
    'addrea paycheck': look(HandCoins, 'bg-[#e4dced]', 'text-[#4e1684]'),               // #4e1684
    'investment income': look(PiggyBank, 'bg-[#def3f1]', 'text-[#17796d]'),            // #22b2a1
    'refunds': look(RefreshCcwDot, 'bg-[#deeeff]', 'text-[#1b6ac1]'),                   // #238bfe
    'resale': look(Handshake, 'bg-[#feeadc]', 'text-[#ac510f]'),                        // #f97516
    'gifts': look(Gift, 'bg-[#f9e4ed]', 'text-[#b33f6e]'),                              // #da4d86
};

// "Other" is red among expenses and green among income, as in the app.
const INCOME_LOOKS: Record<string, CategoryLook> = {
    'other': look(CircleQuestionMark, 'bg-[#e8f3e3]', 'text-[#487930]'),                // #68b045
};

const lookOf = (category: string, type?: Transaction['type']) => {
    const key = (category || '').toLowerCase().trim();
    return (type === 'income' ? INCOME_LOOKS[key] : undefined) ?? CATEGORY_LOOKS[key];
};

export function getCategoryIcon(categoryName: string): LucideIcon {
    const known = lookOf(categoryName);
    if (known) return known.icon;

    const normalized = (categoryName || '').toLowerCase().trim();

    // 1. Direct match
    if (ICON_MAP[normalized]) {
        return ICON_MAP[normalized];
    }

    // 2. Keyword match (check if category contains any key)
    for (const key of Object.keys(ICON_MAP)) {
        if (normalized.includes(key)) {
            return ICON_MAP[key];
        }
    }

    // 3. Fallback: a plain label, so an unknown category doesn't look like a broken one
    return Tag;
}

/** The category's colour (chip background, icon/text colour, chart ink). */
export function getCategoryColor(category: string, type?: Transaction['type']): ColorSet {
    return lookOf(category, type)?.color ?? stringToColor(category);
}
