// Field CRM: adding and removing colleagues (v113).
//
// Creating a sign-in for someone else needs the project's service role,
// which can never be in the app (a public web page). So it lives here, and
// this function answers only the admin of a team, for their own team.
//
//   {action: "add", name, email, password}
//       makes the colleague's sign-in (already confirmed, so no email is
//       sent) and puts them in the admin's team as a member. The admin gives
//       them the temporary password; they change it in Settings.
//   {action: "remove", user_id}
//       marks them removed (migration 0006) and bans their sign-in. Their
//       calls, visits and photos stay with the team.
//
// No team is created here: a team and its admin are set up once, by hand
// (migration 0004). Nothing about the team's data passes through this
// function - it never sees the team passphrase or the key.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_TEAM = 15;          // Ben's team is 4 to 10; headroom, not an invitation
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const no = (error: string, message: string, status = 400) => json({ error, message }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return no("post-only", "POST only", 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await admin.auth.getUser(token);
  const me = who && who.user;
  if (!me) return no("signed-out", "Sign in to cloud sync first.", 401);

  // the caller must be the admin of a team, and not removed from it
  const t = await admin.from("teams").select("id,name,admin").eq("admin", me.id);
  if (t.error) return no("server", t.error.message, 500);
  const team = t.data && t.data[0];
  if (!team) return no("not-admin", "Only the team's admin can add or remove people.", 403);
  const mine = await admin.from("team_members").select("team_id,removed_at").eq("user_id", me.id);
  if (mine.error) return no("server", mine.error.message, 500);
  if (!mine.data || !mine.data[0] || mine.data[0].team_id !== team.id || mine.data[0].removed_at) {
    return no("not-admin", "Only the team's admin can add or remove people.", 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch (_) { return no("bad-request", "That request was not readable."); }

  if (body.action === "add") {
    const name = String(body.name || "").trim().slice(0, 60);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name) return no("bad-name", "Type their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return no("bad-email", "That email address does not look right.");
    if (password.length < 10 || password.length > 72) return no("bad-password", "The temporary password needs 10 to 72 characters.");
    const n = await admin.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", team.id).is("removed_at", null);
    if (n.error) return no("server", n.error.message, 500);
    if ((n.count || 0) >= MAX_TEAM) return no("full", "The team already has " + MAX_TEAM + " people.");

    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (made.error || !made.data.user) {
      const m = made.error ? made.error.message : "";
      if (/already|registered|exists/i.test(m)) return no("exists", "That email address already has a sign-in. Nobody was added.", 409);
      return no("server", m || "The sign-in could not be made.", 500);
    }
    const uid = made.data.user.id;
    const ins = await admin.from("team_members").insert({ user_id: uid, team_id: team.id, name, role: "member" });
    if (ins.error) {
      await admin.auth.admin.deleteUser(uid);       // no half-made colleague left behind
      return no("server", ins.error.message, 500);
    }
    return json({ ok: true, user_id: uid, name, email, team: team.name });
  }

  if (body.action === "remove") {
    const uid = String(body.user_id || "");
    if (uid === me.id) return no("self", "You cannot remove yourself: you are the team's admin.");
    const m = await admin.from("team_members").select("user_id,team_id,removed_at").eq("user_id", uid);
    if (m.error) return no("server", m.error.message, 500);
    const row = m.data && m.data[0];
    if (!row || row.team_id !== team.id) return no("not-found", "That person is not in your team.", 404);
    if (!row.removed_at) {
      const u = await admin.from("team_members").update({ removed_at: new Date().toISOString() }).eq("user_id", uid);
      if (u.error) return no("server", u.error.message, 500);
    }
    // about 100 years: they cannot sign in again unless the admin undoes it in Supabase
    const b = await admin.auth.admin.updateUserById(uid, { ban_duration: "876000h" });
    if (b.error) return no("server", b.error.message, 500);
    return json({ ok: true });
  }

  return no("bad-request", "Unknown action.");
});
