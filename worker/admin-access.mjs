// Per-person administrator access (audit finding N8) and the security event
// log (M4). See docs/remediation/ACCESS_CONTROLS.md.
//
// An admin request carries either
//   * a Supabase access token of a person listed in taxcomp.admin_users, signed
//     in WITH two-step verification (JWT claim aal = "aal2"); or
//   * the old shared ADMIN_DASHBOARD_TOKEN, only while ADMIN_SHARED_TOKEN_ENABLED
//     is "true". It cannot be traced to a person, so it never reaches launch
//     gates, and every use is written to security_events.
// Refusals are written to security_events too (no tokens, passwords or IPs).
import { createSupabaseTokenVerifier, normalizeSupabaseUrl, readBearerToken } from "./supabase-auth.mjs";

const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

export const MFA_REQUIRED_MESSAGE = "Staff and administrator access needs two-step sign-in. Turn it on in TaxComp → Account → Two-step sign-in, then sign in again with your code.";

/** True when the session was completed with a second factor (Supabase aal2). */
export function isStrongSession(claims) {
  return claims?.aal === "aal2";
}

/** Privileged two-step sign-in is required unless the Worker var says "false" (tests only). */
export function privilegedMfaRequired(env) {
  return env?.PRIVILEGED_MFA_REQUIRED !== "false";
}

/** Constant-time comparison of two secrets. */
export function equalSecret(expected, supplied) {
  if (typeof expected !== "string" || typeof supplied !== "string" || expected.length < 32 || expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}

/** Appends one row to security_events. Never throws: logging must not break the request. */
export async function logSecurityEvent(db, { type, outcome, userId = null, email = null, route = "", details = {}, at = new Date().toISOString() }) {
  if (!db || typeof db.prepare !== "function") return false;
  try {
    const detailsJson = JSON.stringify(details).slice(0, 3900);
    await db.prepare(`INSERT INTO security_events (id, occurred_at, event_type, outcome, actor_user_id, actor_email, route, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), at, type, outcome, userId, email, String(route).slice(0, 200), detailsJson).run();
    return true;
  } catch (error) {
    console.error("Security event not recorded", { errorName: error instanceof Error ? error.name : "UnknownError", type });
    return false;
  }
}

export async function loadAdmin(db, userId) {
  const row = await db.prepare(`SELECT user_id AS "userId", email, display_name AS "displayName", can_operate AS "canOperate",
      can_manage_gates AS "canManageGates", can_approve_gates AS "canApproveGates"
    FROM admin_users WHERE user_id = ? AND active = 1`).bind(userId).first();
  if (!row) return null;
  return {
    kind: "person", userId: String(row.userId), email: String(row.email), displayName: String(row.displayName),
    canOperate: Number(row.canOperate) === 1, canManageGates: Number(row.canManageGates) === 1, canApproveGates: Number(row.canApproveGates) === 1,
  };
}

function refused(status, error, extra = {}) {
  return { ok: false, status, body: { error, ...extra } };
}

/**
 * Identifies the administrator behind an admin request.
 * Returns { ok: true, principal } or { ok: false, status, body }.
 * principal.kind is "person" (named, two-step) or "shared" (legacy token).
 */
export async function authenticateAdmin(request, env, { route = new URL(request.url).pathname, allowSharedToken = true } = {}) {
  const db = env.UNANSWERED_QUESTIONS;
  const supplied = readBearerToken(request) || "";
  if (!supplied) return refused(401, "Admin authentication is required. Sign in with your administrator account.");

  if (JWT_SHAPE.test(supplied)) {
    const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
    if (!supabaseUrl || !db) return refused(503, "Admin sign-in is not configured.");
    let claims;
    try {
      claims = await createSupabaseTokenVerifier({ supabaseUrl, ...(env.SUPABASE_FETCH ? { fetchImpl: env.SUPABASE_FETCH } : {}) }).verify(supplied);
    } catch {
      return refused(503, "Sign-in could not be checked. Please try again shortly.");
    }
    if (!claims) {
      await logSecurityEvent(db, { type: "admin.signin", outcome: "refused", route, details: { reason: "invalid_or_expired_token" } });
      return refused(401, "Your sign-in has expired or is not valid. Sign in again.");
    }
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
    const admin = await loadAdmin(db, claims.sub);
    if (!admin) {
      await logSecurityEvent(db, { type: "admin.signin", outcome: "refused", userId: claims.sub, email, route, details: { reason: "not_an_admin" } });
      return refused(403, "This account is not an administrator.");
    }
    if (!isStrongSession(claims)) {
      await logSecurityEvent(db, { type: "admin.signin", outcome: "refused", userId: claims.sub, email, route, details: { reason: "two_step_missing" } });
      return refused(403, MFA_REQUIRED_MESSAGE, { code: "mfa_required" });
    }
    return { ok: true, principal: admin };
  }

  if (!allowSharedToken) {
    await logSecurityEvent(db, { type: "admin.shared_token", outcome: "refused", route, details: { reason: "named_admin_required" } });
    return refused(401, "Sign in with your own administrator account and two-step code. The shared admin token cannot be used here.");
  }
  if (env.ADMIN_SHARED_TOKEN_ENABLED !== "true") {
    await logSecurityEvent(db, { type: "admin.shared_token", outcome: "refused", route, details: { reason: "shared_token_disabled" } });
    return refused(401, "The shared admin token has been switched off. Sign in with your own administrator account.");
  }
  if (typeof env.ADMIN_DASHBOARD_TOKEN !== "string" || env.ADMIN_DASHBOARD_TOKEN.length < 32) {
    console.error("Admin dashboard token is missing or shorter than the minimum length");
    return refused(503, "Admin authentication is not configured safely.");
  }
  if (!equalSecret(env.ADMIN_DASHBOARD_TOKEN, supplied)) {
    await logSecurityEvent(db, { type: "admin.shared_token", outcome: "refused", route, details: { reason: "wrong_token" } });
    return refused(401, "Admin authentication is required.");
  }
  await logSecurityEvent(db, { type: "admin.shared_token", outcome: "allowed", route, details: { method: request.method } });
  return {
    ok: true,
    principal: { kind: "shared", userId: null, email: null, displayName: "Shared admin token", canOperate: true, canManageGates: false, canApproveGates: false },
  };
}

// ------------------------------------------------------------ admin pages
// The pages are served by the Worker. A person signs in straight to Supabase
// Auth (email + password, then the authenticator code), and the page keeps the
// resulting access token in memory only: closing the tab signs them out.

export function adminPageNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, "");
}

export function adminPageHeaders(env, nonce) {
  const supabase = normalizeSupabaseUrl(env.SUPABASE_URL);
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${supabase ? ` ${supabase}` : ""}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** The sign-in form shared by every admin page (id="login"). */
export function adminLoginFormHtml(env, { buttonText = "Sign in", sharedTokenAllowed = true } = {}) {
  const personal = Boolean(normalizeSupabaseUrl(env.SUPABASE_URL) && typeof env.SUPABASE_PUBLISHABLE_KEY === "string" && env.SUPABASE_PUBLISHABLE_KEY.length >= 20);
  const shared = sharedTokenAllowed && env.ADMIN_SHARED_TOKEN_ENABLED === "true";
  return `<form id="login" class="admin-login" data-personal="${personal}" data-supabase-url="${escapeAttribute(normalizeSupabaseUrl(env.SUPABASE_URL) || "")}" data-supabase-key="${escapeAttribute(personal ? env.SUPABASE_PUBLISHABLE_KEY : "")}">
${personal ? `<fieldset><legend>Your administrator account</legend>
<label for="admin-email">Email<input id="admin-email" name="email" type="email" autocomplete="username" maxlength="254"></label>
<label for="admin-password">Password<input id="admin-password" name="password" type="password" autocomplete="current-password" maxlength="128"></label>
<label for="admin-code">Two-step code<input id="admin-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label>
</fieldset>` : `<p>Personal admin sign-in is not configured on this Worker (SUPABASE_PUBLISHABLE_KEY).</p>`}
${shared ? `<details><summary>Use the shared admin token (being retired)</summary>
<label for="token">Shared admin token<input id="token" name="token" type="password" autocomplete="off"></label>
<p class="muted">Every use is logged. It will be switched off once each administrator signs in with their own account.</p></details>` : ""}
<button>${escapeAttribute(buttonText)}</button></form>`;
}

/** Inline script defining adminToken(form): returns a bearer token or throws with a readable message. */
export const ADMIN_LOGIN_SCRIPT = `
async function adminToken(form){
  const shared=form.querySelector('#token');
  if(shared&&shared.value)return shared.value;
  if(form.dataset.personal!=='true')throw new Error('Personal admin sign-in is not configured.');
  const base=form.dataset.supabaseUrl+'/auth/v1',key=form.dataset.supabaseKey;
  const email=form.elements.email.value.trim(),password=form.elements.password.value,code=form.elements.code.value.trim();
  if(!email||!password)throw new Error('Enter your email and password.');
  if(!/^[0-9]{6}$/.test(code))throw new Error('Enter the 6-digit code from your authenticator app.');
  const post=async(path,body,bearer)=>{const r=await fetch(base+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.msg||d.error_description||d.message||'Sign-in failed.'),{status:r.status});return d};
  let first;
  try{first=await post('/token?grant_type=password',{email,password})}catch(e){throw new Error(e.status===429?'Too many sign-in attempts. Wait a few minutes.':'Sign-in failed. Check your email and password.')}
  const factor=((first.user&&first.user.factors)||[]).find(f=>f.factor_type==='totp'&&f.status==='verified');
  if(!factor)throw new Error('Two-step sign-in is not set up for this account. Turn it on in TaxComp → Account first.');
  const challenge=await post('/factors/'+encodeURIComponent(factor.id)+'/challenge',{},first.access_token);
  let verified;
  try{verified=await post('/factors/'+encodeURIComponent(factor.id)+'/verify',{challenge_id:challenge.id,code},first.access_token)}catch{throw new Error('That code was not accepted. Check the time on your phone and try the next code.')}
  form.elements.password.value='';form.elements.code.value='';
  return verified.access_token;
}`;

export const ADMIN_LOGIN_STYLE = ".admin-login{display:grid;gap:.7rem;margin:1.2rem 0;max-width:34rem}.admin-login fieldset{display:grid;gap:.6rem;border:1px solid #ccd4df;border-radius:.5rem;padding:.8rem}.admin-login label{display:grid;gap:.2rem;font-weight:600}.admin-login input{font:inherit;padding:.55rem}.admin-login button{font:inherit;padding:.6rem;cursor:pointer;justify-self:start}.muted{color:#546176}";
