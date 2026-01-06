import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useCategoryLimits = () => {
    const [limits, setLimitsState] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

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
                setLimitsState(limitMap);
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
            const { error } = await supabase
                .from('category_limits')
                .upsert({ category, amount }, { onConflict: 'category' });

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
