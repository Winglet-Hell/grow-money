import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oryartvtjwzkajrjbnwh.supabase.co';
const supabaseKey = 'sb_publishable_oGP3H_RlUbYuzpNxJap1EA_O3XiOwqf';

export const supabase = createClient(supabaseUrl, supabaseKey);
