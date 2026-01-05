import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export type ColorSet = {
    bg: string;
    text: string;
    hex: string; // approximate color for the text/bar
};

const COLORS: ColorSet[] = [
    { bg: 'bg-red-100', text: 'text-red-700', hex: '#b91c1c' },
    { bg: 'bg-orange-100', text: 'text-orange-700', hex: '#c2410c' },
    { bg: 'bg-amber-100', text: 'text-amber-700', hex: '#b45309' },
    { bg: 'bg-yellow-100', text: 'text-yellow-700', hex: '#a16207' },
    { bg: 'bg-lime-100', text: 'text-lime-700', hex: '#4d7c0f' },
    { bg: 'bg-green-100', text: 'text-green-700', hex: '#15803d' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700', hex: '#047857' },
    { bg: 'bg-teal-100', text: 'text-teal-700', hex: '#0f766e' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700', hex: '#0e7490' },
    { bg: 'bg-sky-100', text: 'text-sky-700', hex: '#0369a1' },
    { bg: 'bg-blue-100', text: 'text-blue-700', hex: '#1d4ed8' },
    { bg: 'bg-indigo-100', text: 'text-indigo-700', hex: '#4338ca' },
    { bg: 'bg-violet-100', text: 'text-violet-700', hex: '#6d28d9' },
    { bg: 'bg-purple-100', text: 'text-purple-700', hex: '#7e22ce' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', hex: '#a21caf' },
    { bg: 'bg-pink-100', text: 'text-pink-700', hex: '#be185d' },
    { bg: 'bg-rose-100', text: 'text-rose-700', hex: '#be123c' },
];

export function stringToColor(str: string): ColorSet {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % COLORS.length;
    return COLORS[index];
}
