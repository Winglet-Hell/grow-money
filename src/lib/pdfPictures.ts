import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';

// Pictures for the PDFs the app makes (react-pdf), as data URLs it can place.

// Emoji (the trip's flag, a 🍜 in a note) aren't in the font: each is drawn once with the
// system's emoji font and placed as a picture. Outside a browser there is nothing to draw with.
export const canDrawEmoji = typeof document !== 'undefined';
const emojiPictures = new Map<string, string>();
export function emojiPicture(emoji: string): string {
    let url = emojiPictures.get(emoji);
    if (!url) {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.font = `${size * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, size / 2, size * 0.54);
        url = canvas.toDataURL('image/png');
        emojiPictures.set(emoji, url);
    }
    return url;
}
// react-pdf names an emoji in text by its code points: "1f1ef-1f1f5".
export const emojiOfCode = (code: string) => String.fromCodePoint(...code.split('-').map(hex => parseInt(hex, 16)));

// The app's icons, drawn as vectors. react-pdf keeps only the drawing of an SVG picture, not the
// attributes of its <svg>, so the stroke goes on a group around it.
const iconPictures = new Map<string, string>();
export function iconPicture(icon: LucideIcon, color: string): string {
    const markup = renderToStaticMarkup(createElement(icon));
    const key = `${color}${markup}`;
    let url = iconPictures.get(key);
    if (!url) {
        const drawing = markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`;
        url = `data:image/svg+xml;base64,${btoa(svg)}`;
        iconPictures.set(key, url);
    }
    return url;
}
