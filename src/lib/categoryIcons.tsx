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
    HelpCircle,
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
    type LucideIcon
} from 'lucide-react';

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
    // "Other" is a real bucket, not a missing icon — a question mark read as "unmapped".
    'other': CircleEllipsis,
    'прочее': CircleEllipsis,
    'другое': CircleEllipsis,

    // Income Specific
    'paycheck': DollarSign,
    'oretex': Wallet,
    'addrea': Wallet,
    'refund': Repeat,
};

export function getCategoryIcon(categoryName: string): LucideIcon {
    const normalized = categoryName.toLowerCase().trim();

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

    // 3. Fallback
    return HelpCircle;
}
