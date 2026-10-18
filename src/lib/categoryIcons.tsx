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
    Droplet,
    Users,
    type LucideIcon
} from 'lucide-react';
import type { AppCategory, Transaction } from '../types';
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

// ------------------------------------------------------------------ categories the table lacks
// A category added or renamed in the app since the table was made still looks the app's way: a
// backup names its icon and colour there. The icon comes from this map, which pairs the app's
// icon names with the icons picked above (plus those of categories since removed), and the colour
// goes through the table's own rule, which gives back the table's colours from the app's.

const APP_ICONS: Record<string, LucideIcon> = {
    products: ShoppingBasket, cafe: Utensils, burger: Hamburger, moped: Motorbike, metro: TrainFront,
    travels: PlaneTakeoff, hotel: Hotel, briefcase: Briefcase, repairs: Hammer, cleaning: SprayCan,
    utilities: Zap, rent: Home, return: RefreshCcwDot, phone: PhoneCall, lottery: Ticket, balloon: Balloon,
    shopping: ShoppingBag, clothes: Shirt, mobile1: Smartphone, other: CircleQuestionMark,
    toothpaste: SoapDispenserDroplet, heart: HeartPulse, insurance: ShieldPlus, present: Gift, coins1: Coins,
    paper: FileCog, percent: Percent, investing: BadgeDollarSign, prepaid: HandCoins, piggy_bank: PiggyBank,
    payment: Handshake, bill: Receipt, home: Home, tap: Droplet, wifi: Wifi, education: GraduationCap,
    family: Users, sport: Dumbbell, movie: Film, basket: ShoppingCart, money: Wallet, bank: Landmark,
};

const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb: number[]) => `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map(c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

/** The table's rule: the chip is the app's colour at 15% on white, the ink that colour darkened
 *  only as far as 4.5:1 on the chip needs. */
export function chipColors(appColor: string): { chip: string; ink: string } {
    const rgb = rgbOf(appColor);
    const chip = rgb.map(c => Math.round(255 - 0.15 * (255 - c)));
    let ink = rgb;
    for (let f = 1; contrast(ink, chip) < 4.5 && f > 0; ) {
        f -= 0.01;
        ink = rgb.map(c => Math.round(c * f));
    }
    return { chip: hexOf(chip), ink: hexOf(ink) };
}

// Tailwind makes its classes at build time, so a colour that comes from a backup gets its class
// written into a small stylesheet of its own the first time it's needed.
const madeClasses = new Set<string>();
function colorClass(property: 'background-color' | 'color', hex: string): string {
    const name = `${property === 'color' ? 'gm-ink' : 'gm-chip'}-${hex.slice(1)}`;
    if (!madeClasses.has(name) && typeof document !== 'undefined') {
        madeClasses.add(name);
        let sheet = document.getElementById('gm-category-colors');
        if (!sheet) {
            sheet = document.createElement('style');
            sheet.id = 'gm-category-colors';
            document.head.appendChild(sheet);
        }
        sheet.appendChild(document.createTextNode(`.${name}{${property}:${hex}}`));
    }
    return name;
}

// The categories of the last backup, kept on this device with the imported operations.
const APP_CATEGORIES_KEY = 'growmoney:appCategories';
const appKey = (name: string, type?: Transaction['type']) => `${type === 'income' ? 'income' : 'expense'}|${(name || '').toLowerCase().trim()}`;
let appCategories: Map<string, AppCategory> | null = null;
// `Map` here is the icon of that name, hence globalThis.Map.
const appLooks = new globalThis.Map<string, CategoryLook | null>();

function storedAppCategories(): Map<string, AppCategory> {
    if (appCategories) return appCategories;
    appCategories = new globalThis.Map<string, AppCategory>();
    try {
        const list = JSON.parse(localStorage.getItem(APP_CATEGORIES_KEY) ?? '[]');
        if (Array.isArray(list)) for (const c of list as AppCategory[]) appCategories.set(appKey(c.name, c.type), c);
    } catch { /* nothing stored, or storage blocked */ }
    return appCategories;
}

/** Keeps a backup's categories for the looks of the ones the table doesn't know. */
export function rememberAppCategories(categories: AppCategory[]): void {
    try { localStorage.setItem(APP_CATEGORIES_KEY, JSON.stringify(categories)); } catch { /* storage blocked */ }
    appCategories = null;
    appLooks.clear();
}

export function forgetAppCategories(): void {
    try { localStorage.removeItem(APP_CATEGORIES_KEY); } catch { /* storage blocked */ }
    appCategories = null;
    appLooks.clear();
}

/** A look made from the app's own icon and colour, for a category the table doesn't have. */
function appLook(category: string, type?: Transaction['type']): CategoryLook | undefined {
    const key = appKey(category, type);
    if (!appLooks.has(key)) {
        // Without a type (an icon on its own) either kind of category will do, expenses first.
        const app = storedAppCategories().get(key) ?? (type ? undefined : storedAppCategories().get(appKey(category, 'income')));
        if (!app || !/^#[0-9a-f]{6}$/i.test(app.color)) appLooks.set(key, null);
        else {
            const { chip, ink } = chipColors(app.color);
            appLooks.set(key, {
                icon: APP_ICONS[app.icon] ?? keywordIcon(category),
                color: { bg: colorClass('background-color', chip), text: colorClass('color', ink), hex: ink },
            });
        }
    }
    return appLooks.get(key) ?? undefined;
}

const lookOf = (category: string, type?: Transaction['type']) => {
    const key = (category || '').toLowerCase().trim();
    return (type === 'income' ? INCOME_LOOKS[key] : undefined) ?? CATEGORY_LOOKS[key] ?? appLook(category, type);
};

export function getCategoryIcon(categoryName: string): LucideIcon {
    return lookOf(categoryName)?.icon ?? keywordIcon(categoryName);
}

// An icon from the category's name, for one neither the table nor a backup knows.
function keywordIcon(categoryName: string): LucideIcon {
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
