-- Trips: split payments. One payment can belong to two trips — a flight out of one country
-- bought together with the hotel in the next. Each trip keeps the part of such a payment it
-- counts, by transaction id: { "<id>": 0.6 }. Payments not listed count whole.
-- Run once in the Supabase SQL editor (safe to run again). The owner-only RLS policies cover it.

alter table public.trips add column if not exists transaction_shares jsonb not null default '{}'::jsonb;
