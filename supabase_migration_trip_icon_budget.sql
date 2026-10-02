-- Trips: two optional fields the trip form edits.
--   icon   — an emoji the user picks; without one the app chooses a flag or a picture of the place.
--   budget — what the whole trip may cost, in rubles; the trip page tracks spending against it.
-- Existing trips need neither. Run once in the Supabase SQL editor (safe to run again).
-- The table's owner-only RLS policies cover new columns.

alter table public.trips add column if not exists icon text;
alter table public.trips add column if not exists budget numeric;
