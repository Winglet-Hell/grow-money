// The Grow Money MCP server online, as a Supabase Edge Function (the code is mcp/remote.ts).
// server.js is that code bundled; `npm run mcp:deploy` builds it and deploys the function.
import { handleRequest } from './server.js';

Deno.serve(handleRequest);
