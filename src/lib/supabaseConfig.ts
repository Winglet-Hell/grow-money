// The Supabase project that keeps the wallets, trips, goals, limits and settings. The key is the
// project's publishable one: it ships in every page, and each table lets an owner see only their rows.
export const SUPABASE_URL = 'https://oryartvtjwzkajrjbnwh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oGP3H_RlUbYuzpNxJap1EA_O3XiOwqf';

// The online MCP server (supabase/functions/mcp): the address to add in Claude or ChatGPT.
export const MCP_SERVER_URL = `${SUPABASE_URL}/functions/v1/mcp`;
