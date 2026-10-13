import { useMediaQuery } from './useMediaQuery';

// "Reduce motion" in the system settings. The CSS animations follow it by themselves (index.css);
// this is for motion run from JavaScript, such as the chart bars.
export const usePrefersReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
