import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// The limits outlive the page that loaded them: coming back to the dashboard, it is drawn once
// with them instead of once without and again a second later, when they arrive.
let cachedLimits: Record<string, number> | null = null;

/** Forget them on sign-out, so the next account never sees the previous one's. */
export const clearCategoryLimitsCache = () => { cachedLimits = null; };

const sameLimits = (a: Record<string, number>, b: Record<string, number>) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
};

export const useCategoryLimits = () => {
    const [limits, setLimits] = useState<Record<string, number>>(() => cachedLimits ?? {});
    const [loading, setLoading] = useState(cachedLimits === null);

    // Every change goes to the shared copy too.
    const setLimitsState = (update: (prev: Record<string, number>) => Record<string, number>) => {
        setLimits(prev => {
            const next = update(prev);
            cachedLimits = next;
            return next;
        });
    };

    const fetchLimits = async () => {
        try {
            const { data, error } = await supabase
                .from('category_limits')
                .select('category, amount');

            if (error) {
                console.error('Error fetching limits:', error);
                return;
            }

            if (data) {
                const limitMap: Record<string, number> = {};
                data.forEach((row: any) => {
                    limitMap[row.category] = row.amount;
                });
                // Unchanged since the cached copy: no state change, so nothing redraws.
                if (!cachedLimits || !sameLimits(cachedLimits, limitMap)) {
                    cachedLimits = limitMap;
                    setLimits(limitMap);
                }
            }
        } catch (error) {
            console.error('Unexpected error fetching limits:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLimits();
    }, []);

    const setLimit = async (category: string, amount: number) => {
        // Optimistic update
        setLimitsState(prev => ({ ...prev, [category]: amount }));

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // Should handle error state

            const { error } = await supabase
                .from('category_limits')
                .upsert({
                    category,
                    amount,
                    user_id: user.id
                }, {
                    onConflict: 'user_id, category' // Important: match the new unique constraint
                });

            if (error) {
                console.error('Error saving limit:', error);
                // Revert on error (optional, simplified here)
                fetchLimits();
            }
        } catch (error) {
            console.error('Unexpected error saving limit:', error);
        }
    };

    const removeLimit = async (category: string) => {
        // Optimistic update
        setLimitsState(prev => {
            const next = { ...prev };
            delete next[category];
            return next;
        });

        try {
            const { error } = await supabase
                .from('category_limits')
                .delete()
                .eq('category', category);

            if (error) {
                console.error('Error removing limit:', error);
                fetchLimits();
            }
        } catch (error) {
            console.error('Unexpected error removing limit:', error);
        }
    };

    const getLimit = (category: string) => limits[category];

    return {
        limits,
        loading,
        setLimit,
        removeLimit,
        getLimit
    };
};
