import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTripsState, loadTrips, subscribeTrips } from '../lib/tripsStore';
import type { Trip } from '../types';

// One empty list for "not loaded yet", so pages memoizing on `trips` don't recompute each render.
const NO_TRIPS: Trip[] = [];

/** The current user's trips, shared across pages (see lib/tripsStore). */
export function useTrips() {
    const [state, setState] = useState(getTripsState);

    useEffect(() => {
        const unsubscribe = subscribeTrips(() => setState(getTripsState()));
        loadTrips();
        // Signing in or out switches between the cloud list and the device one; the store
        // only reloads when the user actually changed.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadTrips(); });
        return () => {
            unsubscribe();
            subscription.unsubscribe();
        };
    }, []);

    return {
        trips: state.trips ?? NO_TRIPS,
        loading: state.trips === null && !state.loadError,
        loadError: state.loadError,
        saveError: state.saveError,
    };
}
