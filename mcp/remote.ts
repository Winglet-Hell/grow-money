import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { MCP_SERVER_URL, SUPABASE_URL } from '../src/lib/supabaseConfig';
import { readAppData, type AppData } from './appData';
import { loadCloudStatement } from './cloud';
import { buildContext, type Context } from './context';
import { liveRates } from './rates';
import { createServer } from './server';
import { userOf, type UserToken } from './supabaseRest';

// The online server, for Claude on the phone or the web and for ChatGPT: the same tools over
// Streamable HTTP, deployed as the Supabase Edge Function `mcp` (supabase/functions/mcp). Nobody gets
// in without signing in: the client finds the sign-in through the metadata below, the user approves
// it on the app's consent page (/oauth/consent), and every call then carries a token of that user's
// own account, which the tables answer with their rows only. Stateless: each request stands alone.

export const RESOURCE_URL = MCP_SERVER_URL;
const METADATA_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
    'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id, mcp-protocol-version',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...headers } });

// RFC 9728: where the client learns which server signs users in.
const protectedResource = () => ({
    resource: RESOURCE_URL,
    authorization_servers: [`${SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Grow Money',
});

const unauthorized = (description: string, error?: 'invalid_token') =>
    json({ error: error ?? 'unauthorized', error_description: description }, 401, {
        'WWW-Authenticate': `Bearer realm="Grow Money", resource_metadata="${METADATA_URL}"${error ? `, error="${error}", error_description="${description}"` : ''}`,
    });

// A worker serves several requests while it is warm: tokens and account rows are kept a minute.
const FRESH_MS = 60_000;
const users = new Map<string, { user: UserToken['user']; at: number }>();
const accounts = new Map<string, { data: AppData; at: number }>();

async function verified(token: string): Promise<UserToken['user'] | null> {
    const known = users.get(token);
    if (known && Date.now() - known.at < FRESH_MS) return known.user;
    const user = await userOf(token);
    if (users.size > 50) users.clear();
    if (user) users.set(token, { user, at: Date.now() });
    return user;
}

async function account(auth: UserToken): Promise<AppData> {
    const known = accounts.get(auth.user.id);
    if (known && Date.now() - known.at < FRESH_MS) return known.data;
    const data = await readAppData(auth);
    accounts.set(auth.user.id, { data, at: Date.now() });
    return data;
}

async function loadRemoteContext(auth: UserToken): Promise<Context> {
    const [statement, app, rates] = await Promise.all([loadCloudStatement(auth), account(auth), liveRates()]);
    return buildContext(statement, app, rates);
}

export async function handleRequest(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (new URL(req.url).pathname.endsWith('/.well-known/oauth-protected-resource')) return json(protectedResource());

    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (!token) return unauthorized('Sign in to Grow Money to use these tools.');
    const user = await verified(token);
    if (!user) return unauthorized('The Grow Money sign-in has expired or was revoked.', 'invalid_token');
    const auth: UserToken = { access_token: token, user };

    const server = createServer({ load: () => loadRemoteContext(auth), source: 'account' });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
