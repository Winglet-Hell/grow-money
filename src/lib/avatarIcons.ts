import { User, Smile, Zap, Star, Heart, Ghost, Crown, Sun, Moon, Music, type LucideIcon } from 'lucide-react';

// The avatar picker offers exactly these icons. Looking them up by name through
// `import * as Icons from 'lucide-react'` used to defeat tree-shaking and put the whole
// icon set (~600 KB) into the bundle; an explicit map keeps only these ten.
export const AVATAR_ICONS: Record<string, LucideIcon> = {
    User, Smile, Zap, Star, Heart, Ghost, Crown, Sun, Moon, Music,
};

export const AVATAR_ICON_NAMES = Object.keys(AVATAR_ICONS);

/** Component for a stored avatar name; unknown or empty names fall back to `User`. */
export const getAvatarIcon = (name?: string | null): LucideIcon =>
    (name && AVATAR_ICONS[name]) || User;
