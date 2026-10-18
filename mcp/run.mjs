#!/usr/bin/env node
// Starts the Grow Money MCP server, or one of its commands (node mcp/run.mjs help). The server is
// TypeScript that shares the app's own src/lib, so tsx compiles it on the fly: it always runs the
// code the app has now, with no build step to forget.
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

const serving = !process.argv[2] || process.argv[2] === 'serve';
if (serving) {
    // stdout carries the MCP messages: anything else printed there would break them.
    console.log = console.info = console.debug = console.error;
}

register({ tsconfig: fileURLToPath(new URL('../tsconfig.mcp.json', import.meta.url)) });
const { main } = await import('./cli.ts');
await main(process.argv.slice(2));
