import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, kept up to date as the window or the settings change. */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const media = window.matchMedia?.(query);
        media?.addEventListener('change', onChange);
        return () => media?.removeEventListener('change', onChange);
    }, [query]);
    return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false);
}
