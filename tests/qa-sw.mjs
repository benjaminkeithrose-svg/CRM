// Service worker fetch rules. Only the app's own files (and the CDN library
// listed in ASSETS) are served from the cache. Live data - Supabase, the GitHub
// API - must always go to the network, or a sync keeps seeing the first answer
// it ever got. Found in a real-Chrome run of cloud sync, 2026-10-09.
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };

const ORIGIN = 'https://benjaminkeithrose-svg.github.io';
const handlers = {};
const cached = new Map();
const self = {
  location: new URL(ORIGIN + '/CRM/sw.js'),
  addEventListener: (t, f) => { handlers[t] = f; },
  skipWaiting: () => {}, clients: { claim: () => {} }
};
const caches = {
  match: async (req) => cached.get(typeof req === 'string' ? new URL(req, self.location).href : req.url) || null,
  open: async () => ({ put: async (req, res) => cached.set(req.url, res), add: async () => {} }),
  keys: async () => []
};
let netCalls = 0, netFails = false;
const ctx = { self, caches, URL, Response, Request, console,
  fetch: async (req) => { netCalls++; if (netFails) throw new TypeError('offline'); return new Response('net:' + req.url); } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('sw.js', 'utf8'), ctx);
const ASSETS = vm.runInContext('ASSETS', ctx);

async function fire(url, init = {}) {
  let responded = null;
  const { mode, ...rest } = init;
  const request = new Request(url, rest);
  Object.defineProperty(request, 'mode', { value: mode || 'cors' });
  handlers.fetch({ request, respondWith: p => { responded = p; } });
  return responded ? await responded : undefined;
}

// live data is left to the network
for (const u of ['https://ksuwpjezkumyualdbfmn.supabase.co/rest/v1/records?select=id,client_updated&store=eq.datasets',
                 'https://ksuwpjezkumyualdbfmn.supabase.co/rest/v1/vaults?select=key_id',
                 'https://api.github.com/repos/x/y/contents/exchange/appointments.json?ref=main']) {
  ok((await fire(u)) === undefined, 'not handled by the service worker: ' + u.split('/').slice(2, 3) + new URL(u).pathname);
}
ok(cached.size === 0, 'nothing from Supabase or GitHub is kept in the cache');

// the app's own files and the listed CDN library are
const own = await fire(ORIGIN + '/CRM/app.js');
ok(own && (await own.text()).startsWith('net:'), 'own file fetched and served');
ok(cached.has(ORIGIN + '/CRM/app.js'), 'own file kept for offline');
const cdn = ASSETS.find(a => a.startsWith('http'));
ok(cdn && (await fire(cdn)) !== undefined, 'the CDN library in ASSETS is still cached');

// offline with nothing cached: a script fails honestly; a page load gets the app
netFails = true;
cached.set(new URL('./index.html', self.location).href, new Response('<!doctype html>'));
const script = await fire(ORIGIN + '/CRM/missing.js');
ok(script && script.type === 'error', 'a missing script is a network error, not index.html');
const nav = await fire(ORIGIN + '/CRM/?shared=1', { mode: 'navigate' });
ok(nav && (await nav.text()).startsWith('<!doctype'), 'a page load offline still gets the app');

console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
