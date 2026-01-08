-- Add checkpoint columns to accounts table
-- We use text for flexibility or timestamp with time zone if strict. 
-- Since the frontend sends ISO strings, text is safe, but timestamp represents the data better.

alter table accounts 
add column if not exists balance_date text; -- Storing as ISO string is robust

alter table accounts 
add column if not exists balance_checkpoint_tx_id text;
