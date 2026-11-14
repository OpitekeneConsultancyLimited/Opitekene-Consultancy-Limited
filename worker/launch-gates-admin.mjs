// /admin/gates: the launch-gate register page and its API (audit finding M2).
// Named administrators only (two-step sign-in); the shared admin token is refused.
import { ADMIN_LOGIN_SCRIPT, ADMIN_LOGIN_STYLE, adminLoginFormHtml, adminPageHeaders, adminPageNonce, logSecurityEvent } from "./admin-access.mjs";
import { decideGate, GATE_STATUS_LABEL, GateError, gateHistory, listGates, recordGateDetails, revokeGate, submitGateEvidence, verifyGateChain } from "./launch-gates.mjs";

const MAX_BODY = 40_000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function readBody(request) {
  if ((request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() !== "application/json") throw new GateError(415, "Send the request as JSON.");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new GateError(413, "The request is too large.");
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new GateError(400, "The request must contain a JSON object.");
  }
}

/** Handles /admin/gates/api*. The caller has already authenticated `principal` (kind "person"). */
export async function handleGatesApi(request, env, principal, pathname, now = new Date()) {
  const db = env.UNANSWERED_QUESTIONS;
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  try {
    if (pathname === "/admin/gates/api" && request.method === "GET") {
      const [gates, chain] = await Promise.all([listGates(db, today), verifyGateChain(db)]);
      return json({
        gates, chain, statuses: GATE_STATUS_LABEL,
        me: { userId: principal.userId, displayName: principal.displayName, canManageGates: principal.canManageGates, canApproveGates: principal.canApproveGates },
      }, 200);
    }
    const match = pathname.match(/^\/admin\/gates\/api\/([a-z_]{3,20})\/(history|details|submit|decision|revoke)$/);
    if (!match) return json({ error: "The launch-gate endpoint was not found." }, 404);
    const [, key, action] = match;
    if (action === "history") {
      if (request.method !== "GET") return json({ error: "Use GET." }, 405);
      return json({ history: await gateHistory(db, key) }, 200);
    }
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    const body = await readBody(request);
    let gate;
    if (action === "details") gate = await recordGateDetails(db, key, body, principal, nowIso, today);
    else if (action === "submit") gate = await submitGateEvidence(db, key, body, principal, nowIso, today);
    else if (action === "decision") gate = await decideGate(db, key, body, principal, nowIso, today);
    else gate = await revokeGate(db, key, body, principal, nowIso, today);
    await logSecurityEvent(db, {
      type: `launch_gate.${action}`, outcome: "allowed", userId: principal.userId, email: principal.email, route: pathname,
      details: { gate: key, status: gate.status }, at: nowIso,
    });
    return json({ gate }, 200);
  } catch (error) {
    if (error instanceof GateError) {
      if (error.status === 403) {
        await logSecurityEvent(db, { type: "launch_gate.refused", outcome: "refused", userId: principal.userId, email: principal.email, route: pathname, details: { reason: error.message.slice(0, 200) }, at: nowIso });
      }
      return json({ error: error.message }, error.status);
    }
    console.error("Launch gate request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "The launch-gate request failed." }, 500);
  }
}

export function gatesDashboardResponse(env) {
  const nonce = adminPageNonce();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TaxComp launch gates</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#17233b}h1{font-size:1.8rem}h2{font-size:1.15rem;margin:.2rem 0}
.gate{border:1px solid #ccd4df;border-radius:.6rem;padding:1rem;margin:1rem 0}.badge{display:inline-block;padding:.1rem .55rem;border-radius:1rem;font-size:.85rem;font-weight:650;background:#edf1f6}
.badge[data-status=approved]{background:#dff3e4;color:#175b37}.badge[data-status=evidence_submitted]{background:#fff3cd;color:#6b4e00}.badge[data-status=expired],.badge[data-status=rejected],.badge[data-status=revoked]{background:#fbe4e4;color:#8a1c1c}
.gate form{display:grid;gap:.45rem;margin:.6rem 0;padding:.6rem;background:#f6f7f9;border-radius:.4rem}.gate label{display:grid;gap:.15rem;font-weight:600;font-size:.92rem}
input,select,textarea,button{font:inherit;padding:.45rem}textarea{min-height:3.5rem}button{cursor:pointer;justify-self:start}.muted{color:#546176}.error{color:#a11616}
.evidence a{overflow-wrap:anywhere}.history{font-size:.9rem}.notice{padding:.8rem;border-radius:.5rem;background:#eef4fb}
${ADMIN_LOGIN_STYLE}
</style></head><body><main>
<p><a href="/admin">Admin home</a></p>
<h1>Launch-gate register</h1>
<p class="notice">A gate is approved only by a named approver after the evidence has been recorded and submitted by someone else. Nothing here is approved automatically. An approval lapses on its review date. Public launch needs the other seven gates approved and in date. Every change is kept in a tamper-evident history.</p>
${adminLoginFormHtml(env, { buttonText: "Open the register", sharedTokenAllowed: false })}
<p id="status" role="status" aria-live="polite"></p>
<section id="register" hidden><p id="who" class="muted"></p><p id="chain" class="muted"></p><div id="gates"></div></section>
</main>
<script nonce="${nonce}">
${ADMIN_LOGIN_SCRIPT}
const login=document.querySelector('#login'),statusNode=document.querySelector('#status'),register=document.querySelector('#register'),list=document.querySelector('#gates');
let token='',me=null;
const say=(text,error)=>{statusNode.textContent=text;statusNode.className=error?'error':''};
async function api(path,body){const r=await fetch('/admin/gates/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'The request failed.');return d}
function el(tag,props,children){const n=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v==null)continue;if(k==='text')n.textContent=v;else if(k==='on')for(const [e,f] of Object.entries(v))n.addEventListener(e,f);else n.setAttribute(k,v)}for(const c of [].concat(children||[]))if(c)n.append(c);return n}
function field(label,input){return el('label',{},[label,input])}
function form(title,fields,button,handler){const f=el('form',{'aria-label':title},[el('strong',{text:title}),...fields,el('button',{text:button})]);f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await handler(new FormData(f));await load();say('Saved.')}catch(err){say(err.message,true)}finally{b.disabled=false}});return f}
const date=iso=>iso?new Date(iso).toLocaleString():'';
function gateCard(g){
  const canEdit=(me.canManageGates||me.canApproveGates)&&g.status!=='evidence_submitted';
  const card=el('article',{class:'gate','data-gate':g.key},[
    el('h2',{text:g.position+'. '+g.title}),
    el('p',{},[el('span',{class:'badge','data-status':g.status,text:g.statusLabel})]),
    el('p',{text:'Responsible: '+(g.responsiblePerson||'not yet appointed')+' ('+g.responsibleRole+')'}),
    el('p',{},[el('strong',{text:'Required evidence'})]),
    el('ul',{},g.requiredEvidence.map(t=>el('li',{text:t}))),
    el('p',{},[el('strong',{text:'Recorded evidence'})]),
    g.evidence.length?el('ul',{class:'evidence'},g.evidence.map(item=>el('li',{},[/^https:\\/\\//.test(item.reference)?el('a',{href:item.reference,rel:'noopener noreferrer',target:'_blank',text:item.title}):el('span',{text:item.title+': '+item.reference}),el('span',{class:'muted',text:' ('+item.kind.replace('_',' ')+', added by '+(item.addedByName||'an administrator')+' '+date(item.addedAt)+')'})]))):el('p',{class:'muted',text:'None recorded yet.'}),
    el('p',{text:'Outstanding issues: '+(g.outstandingIssues||'none recorded')}),
    g.approvedAt?el('p',{text:'Approved by '+(g.approvedByName||'an approver')+' on '+date(g.approvedAt)+'; review by '+g.reviewBy}):null,
    g.evidenceSubmittedAt&&g.status==='evidence_submitted'?el('p',{text:'Evidence submitted '+date(g.evidenceSubmittedAt)+(g.evidenceSubmittedBy===me.userId?' by you (another approver must decide)':'')}):null,
    g.decisionNotes?el('p',{text:'Decision notes: '+g.decisionNotes}):null,
  ]);
  if(canEdit){
    card.append(form('Responsible person and outstanding issues',[field('Responsible person (full name)',el('input',{name:'responsiblePerson',maxlength:'160',value:g.responsiblePerson||''})),field('Outstanding issues',el('textarea',{name:'outstandingIssues',maxlength:'4000'},[g.outstandingIssues||'']))],'Save details',d=>api('/'+g.key+'/details',{responsiblePerson:d.get('responsiblePerson'),outstandingIssues:d.get('outstandingIssues')})));
    if(g.status!=='approved'&&g.status!=='expired'){
      const kind=el('select',{name:'kind'},[['document','Document'],['report','Report'],['test_result','Test result'],['sign_off','Signed sign-off'],['other','Other']].map(([v,t])=>el('option',{value:v,text:t})));
      card.append(form('Add evidence',[field('Title',el('input',{name:'title',maxlength:'200',required:''})),field('Link (https://) or document reference',el('input',{name:'reference',maxlength:'500',required:''})),field('Kind',kind)],'Add evidence',d=>api('/'+g.key+'/details',{evidence:[{title:d.get('title'),reference:d.get('reference'),kind:d.get('kind')}]})));
      if(g.evidence.length)card.append(form('Submit the evidence for approval',[field('Note for the approver (optional)',el('textarea',{name:'note',maxlength:'2000'}))],'Submit for approval',d=>api('/'+g.key+'/submit',{note:d.get('note')})));
    }
  }
  if(me.canApproveGates&&g.status==='evidence_submitted'&&g.evidenceSubmittedBy!==me.userId){
    const decision=el('select',{name:'decision'},[el('option',{value:'approve',text:'Approve'}),el('option',{value:'reject',text:'Reject'})]);
    card.append(form('Decision',[field('Decision',decision),field('Review by (required to approve, within 12 months)',el('input',{name:'reviewBy',type:'date'})),field('Decision notes (what you checked)',el('textarea',{name:'notes',maxlength:'4000',required:''}))],'Record decision',d=>api('/'+g.key+'/decision',{decision:d.get('decision'),reviewBy:d.get('reviewBy'),notes:d.get('notes')})));
  }
  if(me.canApproveGates&&(g.status==='approved'||g.status==='expired')){
    card.append(form('Revoke the approval',[field('Reason',el('textarea',{name:'notes',maxlength:'4000',required:''}))],'Revoke approval',d=>api('/'+g.key+'/revoke',{notes:d.get('notes')})));
  }
  const historyBox=el('div',{class:'history'});
  card.append(el('button',{type:'button',text:'Show history',on:{click:async()=>{try{const {history}=await api('/'+g.key+'/history');historyBox.replaceChildren(history.length?el('ol',{},history.map(h=>el('li',{text:date(h.occurredAt)+': '+h.action.replace('_',' ')+' ('+h.fromStatus+' → '+h.toStatus+') by '+(h.actorEmail||h.actorUserId)}))):el('p',{class:'muted',text:'No changes recorded yet.'}))}catch(err){say(err.message,true)}}}}),historyBox);
  return card;
}
async function load(){const data=await api('');me=data.me;document.querySelector('#who').textContent='Signed in as '+me.displayName+(me.canApproveGates?' (launch-gate approver)':me.canManageGates?' (can record evidence)':' (view only)');document.querySelector('#chain').textContent=data.chain.ok?'History intact: '+data.chain.events+' recorded change(s), hash chain verified.':'WARNING: the gate history does not verify (first broken entry '+data.chain.brokenAt+'). Report this at once.';list.replaceChildren(...data.gates.map(gateCard));register.hidden=false}
login.addEventListener('submit',async e=>{e.preventDefault();try{token=await adminToken(login);await load();login.hidden=true;say('')}catch(err){token='';say(err.message,true)}});
</script></body></html>`;
  return new Response(html, { status: 200, headers: adminPageHeaders(env, nonce) });
}
