import fs from 'node:fs/promises';
import path from 'node:path';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/lib/supabaseConfig';
import { HOME_DIR, LOGIN_COMMAND, SESSION_FILE } from './paths';
import { errorMessageOf, type UserToken } from './supabaseRest';

// The Grow Money account the local server reads as: a Supabase session kept in
// ~/.grow-money/session.json, readable by this macOS user only. The password is sent once, by
// `login`, and never stored. The rows are read through supabaseRest, which only ever GETs.

export interface Session extends UserToken {
    refresh_token: string;
    expires_at: number; // unix seconds
}

/** The account can't be read until the user signs in again. */
export class SignInNeeded extends Error {}

class AuthError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const LOCK_DIR = path.join(HOME_DIR, 'session.lock');
const REFRESH_MARGIN_S = 60;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parseBody = (text: string): Record<string, unknown> => {
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { msg: text.slice(0, 200) };
    }
};

async function authRequest(endpoint: string, body: unknown, accessToken?: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
    });
    const data = parseBody(await res.text());
    if (!res.ok) throw new AuthError(res.status, errorMessageOf(data, res.status));
    return data;
}

function sessionOf(data: Record<string, unknown>): Session {
    const user = (data.user ?? {}) as { id?: string; email?: string };
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || !user.id) {
        throw new Error('Supabase answered without a session.');
    }
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: typeof data.expires_at === 'number' ? data.expires_at : Math.floor(Date.now() / 1000) + expiresIn,
        user: { id: user.id, email: user.email ?? null },
    };
}

export async function readSession(): Promise<Session | null> {
    let text: string;
    try {
        text = await fs.readFile(SESSION_FILE, 'utf8');
    } catch {
        return null;
    }
    try {
        const s = JSON.parse(text) as Session;
        return s && typeof s.refresh_token === 'string' && typeof s.access_token === 'string' && s.user?.id ? s : null;
    } catch {
        return null;
    }
}

async function writeSession(session: Session): Promise<void> {
    await fs.mkdir(HOME_DIR, { recursive: true, mode: 0o700 });
    const tmp = `${SESSION_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
    await fs.rename(tmp, SESSION_FILE);
}

// Claude Desktop and Claude Code may each run a copy of the server. A refresh token works once, so
// two copies refreshing together would sign each other out: they take turns, and the second one
// reads the token the first one saved.
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(HOME_DIR, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 15_000;
    for (;;) {
        try {
            await fs.mkdir(LOCK_DIR);
            break;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
            // Left behind by a process that died mid-refresh.
            const stat = await fs.stat(LOCK_DIR).catch(() => null);
            if (stat && Date.now() - stat.mtimeMs > 30_000) {
                await fs.rm(LOCK_DIR, { recursive: true, force: true });
                continue;
            }
            if (Date.now() > deadline) throw new Error('Another copy of the server is renewing the sign-in. Try again in a moment.');
            await sleep(150);
        }
    }
    try {
        return await fn();
    } finally {
        await fs.rm(LOCK_DIR, { recursive: true, force: true });
    }
}

const isFresh = (s: Session) => s.expires_at - REFRESH_MARGIN_S > Date.now() / 1000;

/** The saved session with a valid access token, renewed when it is about to expire; null when never signed in. */
export async function currentSession(): Promise<Session | null> {
    const saved = await readSession();
    if (!saved) return null;
    if (isFresh(saved)) return saved;
    return withLock(async () => {
        const latest = await readSession();
        if (!latest) return null;
        if (isFresh(latest)) return latest;
        try {
            const next = sessionOf(await authRequest('token?grant_type=refresh_token', { refresh_token: latest.refresh_token }));
            await writeSession(next);
            return next;
        } catch (e) {
            // Spent or revoked (signed out of every device, password changed): only a new sign-in helps.
            if (e instanceof AuthError && e.status >= 400 && e.status < 500) {
                throw new SignInNeeded(`The Grow Money sign-in has expired (${e.message}). Run \`${LOGIN_COMMAND}\` in a terminal to sign in again.`);
            }
            throw e;
        }
    });
}

export async function signIn(email: string, password: string): Promise<Session> {
    let data: Record<string, unknown>;
    try {
        data = await authRequest('token?grant_type=password', { email, password });
    } catch (e) {
        if (e instanceof AuthError && e.status >= 400 && e.status < 500) throw new Error(e.message);
        throw e;
    }
    const session = sessionOf(data);
    await writeSession(session);
    return session;
}

/** Ends the session on the server too, so the saved token stops working anywhere. */
export async function signOut(): Promise<boolean> {
    const saved = await readSession();
    if (!saved) return false;
    try {
        const session = await currentSession();
        if (session) await authRequest('logout?scope=local', {}, session.access_token);
    } catch {
        // Already expired or offline: removing the file is what matters here.
    }
    await fs.rm(SESSION_FILE, { force: true });
    return true;
}
