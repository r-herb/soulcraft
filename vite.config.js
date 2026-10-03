import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
let sha = 'local';
try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
// The version players see: v.2.<day>-<month>-<year>-<hhmm>, from the commit
// time on Malaga's clock (every build of one commit gets the same version).
let when = new Date();
try { when = new Date(execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* not a git checkout */ }
if (process.env.APP_BUILD_TIME) when = new Date(process.env.APP_BUILD_TIME);
const part = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(when).map((p) => [p.type, p.value]));
const VERSION = `v.${pkg.version.split('.')[0]}.${part.day}-${part.month}-${part.year}-${part.hour}${part.minute}`;

// Writes dist/sw.js from src/sw-template.js with every build file precached
// and a per-build version, so each deploy gets a fresh cache.
function serviceWorker() {
  let outDir;
  return {
    name: 'soulcraft-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = [];
      const walk = (d) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push('/' + relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      // '/index.html' is left out: hosts redirect it to '/', and a redirected
      // response must not be served to a navigation.
      const precache = ['/', ...files.filter((f) => !/(^\/_headers$|\/sw\.js$|^\/version\.json$|\.map$|^\/_redirects$|^\/index\.html$)/.test(f))];
      const stamp = VERSION + '-' + sha + '-' + Date.now().toString(36);
      const src = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(stamp))
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), src);
      // what the running game compares itself with to offer an update
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: VERSION, sha }));
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(VERSION), __APP_SHA__: JSON.stringify(sha) },
  build: {
    target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 900,
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } },
  },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  plugins: [serviceWorker()],
});
