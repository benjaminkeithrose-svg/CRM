// Field CRM: where are the current Intralox manuals?
//
// A web page cannot read intralox.com (no CORS header), but it can download
// the PDFs themselves, which are on a file host that allows it. So this does
// only the part the app cannot: read the two public resource pages and return
// the current link, title, date and size of each manual. The app downloads
// the files itself.
//
// Public pages and public files, no secrets and no user data. It is still
// deployed with verify_jwt on, so only a signed-in device can call it and the
// function cannot be used as an open fetcher. Answers are cached for six hours
// per instance so a busy day does not hammer intralox.com.

const PAGES = [
  "https://www.intralox.com/products/modular-plastic-belting/resources",
  "https://www.intralox.com/products/thermodrive/resources",
];
// matched against the link's data-analytics-title, which names each file plainly
const KINDS: [string, RegExp][] = [
  ["mpb", /Modular Plastic Conveyor Belts Engineering Manual/i],
  ["td", /ThermoDrive Engineering Manual/i],
  ["install", /MPB Installation Instructions/i],
  ["thermolace", /ThermoLace/i],
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
type Doc = { url: string; title: string; page: string; modified?: string; bytes?: number };
let cache: { at: number; body: unknown } | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (cache && Date.now() - cache.at < 6 * 3600e3) return json(cache.body);

  const docs: Record<string, Doc> = {};
  const errors: string[] = [];
  for (const page of PAGES) {
    try {
      const r = await fetch(page, { headers: { "user-agent": "Mozilla/5.0 (Field CRM manual check)" } });
      if (!r.ok) { errors.push(page + " " + r.status); continue; }
      const html = await r.text();
      for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
        const tag = m[0];
        const href = /href="([^"]+\.pdf)"/i.exec(tag);
        const title = /data-analytics-title="([^"]*)"/i.exec(tag);
        if (!href || !title) continue;
        const t = title[1].replace(/^File\s*-\s*/i, "").trim();
        const kind = KINDS.find(([, re]) => re.test(t));
        // the explicit :443 is noise; one spelling, so the app can compare links
        if (kind && !docs[kind[0]]) docs[kind[0]] = { url: href[1].replace(":443/", "/"), title: t, page };
      }
    } catch (e) {
      errors.push(page + " " + (e instanceof Error ? e.message : String(e)));
    }
  }
  // the file's own date marks the edition, even if Intralox ever reuses a link
  await Promise.all(Object.values(docs).map(async (d) => {
    try {
      const h = await fetch(d.url, { method: "HEAD" });
      d.modified = h.headers.get("last-modified") || "";
      d.bytes = Number(h.headers.get("content-length") || 0);
    } catch (_) { /* the link alone is still useful */ }
  }));

  const body = { checked: new Date().toISOString(), docs, errors };
  if (Object.keys(docs).length) cache = { at: Date.now(), body };
  return json(body, Object.keys(docs).length ? 200 : 502);
});
