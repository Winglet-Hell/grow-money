import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/lib/supabaseConfig';

// Reading the account over Supabase's REST API as one signed-in user. Every table lets an owner see
// only their own rows (RLS), and these helpers only ever GET, so whoever holds a token can read that
// user's data and change nothing. Shared by the local server (a token from `login`) and the online
// one (a token Claude or ChatGPT got through the OAuth consent page).

export interface UserToken {
    access_token: string;
    user: { id: string; email: string | null };
}

const parseBody = (text: string): Record<string, unknown> => {
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { msg: text.slice(0, 200) };
    }
};

// Supabase answers errors as {msg} or {message} or {error_description} depending on the service.
export const errorMessageOf = (body: Record<string, unknown>, status: number) =>
    String(body.msg ?? body.error_description ?? body.message ?? body.error ?? `HTTP ${status}`);

/** Rows of one table, as the signed-in user may see them. */
export async function selectRows<T>(auth: UserToken, table: string, query: Record<string, string>): Promise<T[]> {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const res = await fetch(url, {
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${auth.access_token}`,
            Accept: 'application/json',
        },
    });
    const text = await res.text();
    if (!res.ok) {
        const body = parseBody(text);
        throw Object.assign(new Error(`${table}: ${errorMessageOf(body, res.status)}`), { code: body.code });
    }
    return JSON.parse(text) as T[];
}

/** Who a token belongs to, or null when Supabase doesn't accept it (expired, revoked, not ours). */
export async function userOf(accessToken: string): Promise<UserToken['user'] | null> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const user = parseBody(await res.text()) as { id?: string; email?: string };
    return user.id ? { id: user.id, email: user.email ?? null } : null;
}
