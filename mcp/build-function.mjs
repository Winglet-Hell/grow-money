// Bundles the online server (mcp/remote.ts and everything it uses from src/lib) into one ES module
// for the Supabase Edge Function in supabase/functions/mcp. Run by `npm run mcp:deploy`.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const result = await build({
    entryPoints: [at('./remote.ts')],
    outfile: at('../supabase/functions/mcp/server.js'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    define: { 'process.env.NODE_ENV': '"production"' },
    tsconfig: at('../tsconfig.mcp.json'),
    metafile: true,
    logLevel: 'warning',
});

const [output] = Object.values(result.metafile.outputs);
console.log(`supabase/functions/mcp/server.js: ${(output.bytes / 1024).toFixed(0)} KB`);
