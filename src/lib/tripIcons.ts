import type { Transaction, Trip } from '../types';
import { dateKeyOf } from './periods';
import { resolveTrip } from './tripUtils';

// A trip's icon: the emoji the user chose, else the flag of where it went — read from the name
// ("Japan", "Vietnam #hanoi", "Seoul"), else from the local money spent there (cash yen, GoPay
// rupiah). Trips inside the home country get a picture of the place instead: the home flag on
// every one of them would make them all look alike.

/** "JP" → 🇯🇵 */
export const flagOf = (country: string) =>
    String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));

// Place names (English and Russian) → ISO country. Countries, then the cities people fly to.
const PLACES: Record<string, string[]> = {
    TH: ['thailand', 'таиланд', 'тайланд', 'bangkok', 'бангкок', 'phuket', 'пхукет', 'krabi', 'краби', 'pattaya', 'паттайя', 'chiang mai', 'чиангмай', 'chiang rai', 'samui', 'самуи', 'phangan', 'koh tao', 'phi phi', 'lanta', 'koh chang', 'lipe', 'hua hin', 'хуахин', 'udon thani', 'ayutthaya', 'kanchanaburi', 'khao lak', 'pai'],
    JP: ['japan', 'япония', 'tokyo', 'токио', 'osaka', 'осака', 'kyoto', 'киото', 'hokkaido', 'sapporo', 'okinawa', 'nara', 'hakone', 'fukuoka'],
    KR: ['korea', 'корея', 'seoul', 'сеул', 'busan', 'пусан', 'jeju'],
    VN: ['vietnam', 'вьетнам', 'hanoi', 'ханой', 'ho chi minh', 'saigon', 'хошимин', 'da nang', 'дананг', 'nha trang', 'нячанг', 'phu quoc', 'фукуок', 'hoi an', 'sapa', 'dalat', 'da lat'],
    CN: ['china', 'китай', 'shanghai', 'шанхай', 'beijing', 'пекин', 'guangzhou', 'гуанчжоу', 'shenzhen', 'шэньчжэнь', 'guilin', 'yangshuo', 'chengdu', 'hainan', 'sanya', 'хайнань'],
    HK: ['hong kong', 'гонконг'],
    MO: ['macau', 'macao', 'макао'],
    TW: ['taiwan', 'тайвань', 'taipei', 'тайбэй'],
    SG: ['singapore', 'сингапур'],
    MY: ['malaysia', 'малайзия', 'kuala lumpur', 'куала-лумпур', 'куала лумпур', 'penang', 'пенанг', 'langkawi', 'лангкави'],
    ID: ['indonesia', 'индонезия', 'bali', 'бали', 'jakarta', 'джакарта', 'lombok', 'ломбок', 'surabaya', 'ubud', 'yogyakarta'],
    PH: ['philippines', 'филиппины', 'manila', 'манила', 'cebu', 'себу', 'boracay', 'боракай', 'palawan', 'палаван', 'siargao'],
    KH: ['cambodia', 'камбоджа', 'phnom penh', 'siem reap'],
    LA: ['laos', 'лаос', 'vientiane', 'luang prabang'],
    MM: ['myanmar', 'мьянма'],
    IN: ['india', 'индия', 'goa', 'гоа', 'delhi', 'mumbai'],
    LK: ['sri lanka', 'шри-ланка', 'шри ланка'],
    NP: ['nepal', 'непал', 'kathmandu'],
    MV: ['maldives', 'мальдивы'],
    AE: ['emirates', 'uae', 'оаэ', 'dubai', 'дубай', 'abu dhabi'],
    TR: ['turkey', 'türkiye', 'турция', 'istanbul', 'стамбул', 'antalya', 'анталья'],
    EG: ['egypt', 'египет'],
    GE: ['georgia', 'грузия', 'tbilisi', 'тбилиси', 'batumi', 'батуми'],
    AM: ['armenia', 'армения', 'yerevan', 'ереван'],
    KZ: ['kazakhstan', 'казахстан', 'almaty', 'алматы'],
    RU: ['russia', 'россия', 'moscow', 'москва', 'petersburg', 'петербург', 'питер', 'sochi', 'сочи', 'kazan', 'казань'],
    US: ['usa', 'america', 'сша', 'new york', 'нью-йорк', 'los angeles', 'san francisco'],
    GB: ['england', 'britain', 'англия', 'london', 'лондон'],
    FR: ['france', 'франция', 'paris', 'париж'],
    IT: ['italy', 'италия', 'rome', 'рим', 'milan', 'милан'],
    ES: ['spain', 'испания', 'barcelona', 'барселона', 'madrid', 'мадрид'],
    DE: ['germany', 'германия', 'berlin', 'берлин'],
    AU: ['australia', 'австралия', 'sydney', 'сидней'],
};

// What a place at home looks like — enough to tell the home trips apart at a glance.
const SCENERY: Record<string, string[]> = {
    '🏝️': ['phuket', 'пхукет', 'krabi', 'краби', 'samui', 'самуи', 'phangan', 'koh tao', 'phi phi', 'lanta', 'koh chang', 'lipe', 'khao lak', 'bali', 'бали', 'langkawi', 'лангкави', 'boracay', 'palawan', 'phu quoc', 'okinawa', 'jeju', 'hainan', 'sanya', 'maldives', 'мальдивы', 'lombok'],
    '🏖️': ['pattaya', 'паттайя', 'hua hin', 'хуахин', 'nha trang', 'нячанг', 'da nang', 'дананг', 'goa', 'гоа', 'sochi', 'сочи', 'antalya', 'анталья', 'batumi', 'батуми'],
    '⛰️': ['chiang mai', 'чиангмай', 'chiang rai', 'pai', 'sapa', 'dalat', 'da lat', 'hakone', 'kathmandu', 'nepal', 'непал', 'hokkaido'],
    '🛕': ['ayutthaya', 'kanchanaburi', 'luang prabang', 'siem reap', 'kyoto', 'киото', 'nara', 'yogyakarta', 'hoi an'],
    '🏙️': ['bangkok', 'бангкок', 'tokyo', 'токио', 'seoul', 'сеул', 'shanghai', 'шанхай', 'hong kong', 'гонконг', 'singapore', 'сингапур', 'kuala lumpur', 'dubai', 'дубай', 'moscow', 'москва', 'udon thani'],
};

// The money of a country, for trips whose name says nothing about the place. Dollars and coins
// are left out: they pay for things everywhere.
export const CURRENCY_COUNTRY: Record<string, string> = {
    THB: 'TH', JPY: 'JP', KRW: 'KR', VND: 'VN', CNY: 'CN', RMB: 'CN', HKD: 'HK', MOP: 'MO', TWD: 'TW',
    SGD: 'SG', MYR: 'MY', IDR: 'ID', PHP: 'PH', KHR: 'KH', LAK: 'LA', MMK: 'MM', INR: 'IN', LKR: 'LK',
    NPR: 'NP', MVR: 'MV', AED: 'AE', TRY: 'TR', EGP: 'EG', GEL: 'GE', AMD: 'AM', KZT: 'KZ', RUB: 'RU',
    GBP: 'GB', EUR: 'EU', AUD: 'AU', CHF: 'CH', CZK: 'CZ', PLN: 'PL', HUF: 'HU',
};

const containsPlace = (text: string, place: string) =>
    new RegExp(`(?<![\\p{L}])${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text);

const countryFromName = (name: string): string | null => {
    const text = name.toLowerCase();
    for (const [country, places] of Object.entries(PLACES)) if (places.some(p => containsPlace(text, p))) return country;
    return null;
};

const sceneryFromName = (name: string): string | null => {
    const text = name.toLowerCase();
    for (const [emoji, places] of Object.entries(SCENERY)) if (places.some(p => containsPlace(text, p))) return emoji;
    return null;
};

// The currency most expenses were paid in, as a country — where "home" is.
const homeCache = new WeakMap<Transaction[], string | null>();
export function homeCountry(txs: Transaction[]): string | null {
    if (homeCache.has(txs)) return homeCache.get(txs)!;
    const counts = new Map<string, number>();
    for (const t of txs) {
        if (t.type !== 'expense') continue;
        const country = CURRENCY_COUNTRY[(t.originalCurrency || t.currency || 'RUB').toUpperCase()];
        if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
    }
    const home = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    homeCache.set(txs, home);
    return home;
}

// Where the trip's own money was spent — the local currency with the most spent in it.
function countryFromSpending(trip: Trip, txs: Transaction[]): string | null {
    const spent = new Map<string, number>();
    for (const t of resolveTrip(trip, txs).counted) {
        if (!t.originalCurrency || (dateKeyOf(t.date) ?? '') < trip.startDate) continue;
        const country = CURRENCY_COUNTRY[t.originalCurrency.toUpperCase()];
        if (country) spent.set(country, (spent.get(country) ?? 0) + Math.abs(t.amount));
    }
    return [...spent.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The icon the app picks for a trip by itself, or null when there is nothing to go on. */
export function autoTripIcon(trip: Trip, txs: Transaction[]): string | null {
    const country = countryFromName(trip.name) ?? countryFromSpending(trip, txs);
    if (!country) return null;
    if (country === homeCountry(txs)) return sceneryFromName(trip.name) ?? flagOf(country);
    return flagOf(country);
}

/** The icon to show: the user's own emoji, else the automatic one (null → a plane). */
export const tripIcon = (trip: Trip, txs: Transaction[]): string | null => trip.icon || autoTripIcon(trip, txs);

// Offered in the trip form next to the automatic choice.
export const ICON_CHOICES = ['✈️', '🏝️', '🏖️', '⛰️', '🏙️', '🛕', '🏯', '🌋', '🏕️', '🚆', '🚗', '⛵', '🎉', '💼', '❤️', '👨‍👩‍👧', '🎿', '🌸', '🍜', '🏳️‍🌈', '💦', '🎤'];
