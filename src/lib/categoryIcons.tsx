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
    type LucideIcon
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
    // Food & Drink
    'food': Utensils,
    'restaurant': Utensils,
    'cafe': Coffee,
    'coffee': Coffee,
    'bar': Utensils,
    'groceries': ShoppingCart,
    'supermarket': ShoppingCart,
    'products': ShoppingCart,
    'продукты': ShoppingCart,
    'еда': Utensils,
    'ресторан': Utensils,
    'кафе': Coffee,

    // Transport
    'transport': Car,
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

    // Shopping
    'shopping': ShoppingBag,
    'clothes': Shirt,
    'clothing': Shirt,
    'fashion': Shirt,
    'shoes': Shirt,
    'electronics': Smartphone,
    'gadgets': Smartphone,
    'одежда': Shirt,
    'покупки': ShoppingBag,

    // Housing & Utilities
    'housing': Home,
    'rent': Home,
    'mortgage': Home,
    'utilities': Zap,
    'electricity': Zap,
    'water': Zap,
    'internet': Wifi,
    'phone': Smartphone,
    'mobile': Smartphone,
    'дом': Home,
    'коммуналка': Zap,

    // Health & Fitness
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

    // Entertainment & Leisure
    'entertainment': Gamepad2,
    'games': Gamepad2,
    'gaming': Gamepad2,
    'movies': Film,
    'cinema': Film,
    'music': Music,
    'spotify': Music,
    'books': Book,
    'развлечения': Gamepad2,
    'кино': Film,

    // Travel
    'travel': Plane,
    'flight': Plane,
    'hotel': Hotel,
    'vacation': Plane,
    'путешествия': Plane,

    // Education
    'education': GraduationCap,
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

    // Income/Financial
    'salary': DollarSign,
    'wages': DollarSign,
    'bonus': Gift,
    'investment': Briefcase,
    'savings': PiggyBank,
    'transfer': CreditCard,
    'зарплата': DollarSign,
    'перевод': CreditCard,

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
    'subscriptions': RefreshCw,
    'excursions': Map,
    'leisure': Smile,
    'delivery': Truck,
    'retail': ShoppingBag,
    'trip': Plane,
    'gifts': Gift,
    'taxes': Landmark,
    'other': HelpCircle,

    // Income Specific
    'paycheck': DollarSign,
    'oretex': Briefcase,
    'addrea': Briefcase,
    'investing': Briefcase,
    'refund': RefreshCw,
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
