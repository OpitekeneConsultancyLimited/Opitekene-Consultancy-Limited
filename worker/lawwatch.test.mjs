// Phase 7 legislative watch: parser, robots, change detection, the daily run
// on real Postgres (PGlite) with a fake Bill Tracker, and the reviewer API.
// Fixtures follow the structure of the live tracker pages (read 2026-11-11).
import test from "node:test";
import assert from "node:assert/strict";
import { compareBill, isTaxBill, parseBillStage, parseTrackerIndex, planQueue, robotsAllows, runLawWatch, trackerDate } from "./challenge/lawwatch.mts";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const INDEX = `<html><body><table>
<tr><td><a href="user_bill_stage.php?billid=561">The Excise Duty (Amendment) Bill, 2026</a></td></tr>
<tr><td><a href="user_bill_stage.php?billid=560">The Protection of Soveriegnty Bill, 2026</a></td></tr>
<tr><td><a href="user_bill_stage.php?billid=555">The Hides and Skins (Export Duty)(Amendment) Bill,2025.</a></td></tr>
<tr><td><a href="user_bill_stage.php?billid=561">The Excise Duty (Amendment) Bill, 2026</a></td></tr>
</table></body></html>`;

function stagePage({ title, cap, first = "01/04/2026", second = "01/01/1970", third = "01/01/1970", assent = "01/01/1970", withdrawn = "01/01/1970" }) {
  return `<html><body><h3>Bill Progress</h3><a>Go Back</a>
<h4>Object of the Bill</h4><p>The object of this bill is to amend the ${cap ? `Excise Duty Act, ${cap}` : "law"}, to revise the rates.</p>
<div>Bill Document</div><div>${title}</div><div>Sponsored By</div><div>Hon. Minister</div>
<ul><li>Start</li><li>${first}</li><li>First Reading/Committee</li><li>The bill is still at First Reading.</li>
<li>${second}</li><li>Second Reading</li><li>The Bill has now progressed to the Second Reading.</li>
<li>${third}</li><li>${third}</li><li>Third Reading</li><li>Parliament has passed the Bill.</li>
<li>01/01/1970</li><li>Presentation/Waiting Assent</li><li>01/01/1970</li><li>${assent}</li><li>Assented by President</li><li>End</li></ul>
<p>Bill passed on 01/01/1970</p><p>Bill Withdrawn on ${withdrawn}</p><footer>© Bill Tracker.</footer></body></html>`;
}

test("tracker pages: index, tax filter, stages, unrecorded dates", () => {
  assert.deepEqual(parseTrackerIndex(INDEX).map((b) => b.billId), [561, 560, 555], "each Bill once");
  assert.equal(isTaxBill("The Excise Duty (Amendment) Bill, 2026"), true);
  assert.equal(isTaxBill("The Protection of Soveriegnty Bill, 2026"), false);
  assert.equal(isTaxBill("The Hides and Skins (Export Duty)(Amendment) Bill,2025."), true);
  assert.equal(trackerDate("01/01/1970"), null, "the tracker's placeholder means not recorded");
  assert.equal(trackerDate("21/04/2026"), "2026-04-21");
  assert.equal(trackerDate("31/02/2026"), null);

  const passed = parseBillStage(561, stagePage({ title: "The Excise Duty (Amendment) Bill, 2026", cap: "Cap. 336", second: "21/04/2026", third: "21/04/2026" }));
  assert.deepEqual({ title: passed.title, caps: passed.capReferences, first: passed.firstReading, second: passed.secondReading, third: passed.thirdReading, assent: passed.assentDate, stage: passed.stage },
    { title: "The Excise Duty (Amendment) Bill, 2026", caps: ["Cap. 336"], first: "2026-04-01", second: "2026-04-21", third: "2026-04-21", assent: null, stage: "passed" });
  assert.match(passed.object, /amend the Excise Duty Act, Cap\. 336/);
  assert.equal(parseBillStage(1, stagePage({ title: "The X Tax Bill, 2026" })).stage, "first_reading");
  assert.equal(parseBillStage(1, stagePage({ title: "The X Tax Bill, 2026", second: "02/04/2026", third: "03/04/2026", assent: "30/06/2026" })).stage, "assented");
  assert.equal(parseBillStage(1, stagePage({ title: "The X Tax Bill, 2026", withdrawn: "05/05/2026" })).stage, "withdrawn");
});

test("robots.txt: no file allows; Disallow and Allow rules are respected", () => {
  assert.equal(robotsAllows("", "/user_bill_stage.php"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /user_bill_stage.php", "/user_bill_stage.php"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /user_bill_stage.php", "/user_bill_stage.php"), true);
  assert.equal(robotsAllows("User-agent: Googlebot\nDisallow: /", "/"), true, "rules for another robot do not apply");
});

test("changes are described for a reviewer; bills never become law here", () => {
  const base = { billId: 561, title: "The Excise Duty (Amendment) Bill, 2026", object: "", capReferences: [], firstReading: "2026-04-01", secondReading: "2026-04-21", thirdReading: "2026-04-21", assentDate: null, withdrawnDate: null, stage: "passed" };
  assert.equal(compareBill(null, base).kind, "new_bill");
  assert.match(compareBill(null, base).summary, /not yet law/);
  const stored = { billId: 561, stage: "second_reading", title: base.title, firstReading: "2026-04-01", secondReading: "2026-04-21", thirdReading: null, assentDate: null };
  const change = compareBill(stored, base);
  assert.deepEqual([change.kind, change.fromStage, change.toStage], ["stage_change", "second_reading", "passed"]);
  assert.equal(compareBill({ ...stored, stage: "passed", thirdReading: "2026-04-21" }, base), null, "nothing new");
  assert.equal(compareBill({ ...stored, stage: "passed", thirdReading: "2026-04-20" }, base).kind, "dates_change");
});

test("queue: unseen Bills first, then least recently checked; settled Bills monthly", () => {
  const bills = [1, 2, 3, 4].map((billId) => ({ billId, title: `Tax Bill ${billId}` }));
  const now = new Date("2026-11-11T02:15:00Z");
  const stored = new Map([
    [1, { stage: "passed", lastCheckedAt: "2026-11-10T02:15:00Z" }],
    [2, { stage: "assented", lastCheckedAt: "2026-11-01T02:15:00Z" }],
    [3, { stage: "passed", lastCheckedAt: "2026-11-05T02:15:00Z" }],
  ]);
  assert.deepEqual(planQueue(bills, stored, now).map((b) => b.billId), [4, 3, 1], "2 is assented and checked 10 days ago: skipped");
  assert.deepEqual(planQueue(bills, stored, now, 2).map((b) => b.billId), [4, 3]);
});

function fakeTracker(pages) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), ua: init.headers?.["User-Agent"] });
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return new Response("not found", { status: 404 });
    if (u.pathname === "/") return new Response(pages.index, { status: 200 });
    const page = pages[u.searchParams.get("billid")];
    return page ? new Response(page, { status: 200 }) : new Response("missing", { status: 404 });
  };
  return { calls, fetchImpl };
}

test("daily run on Postgres: records tax Bills, logs each change once, and leaves the law register alone", async () => {
  const { pg, db } = await createMigratedDatabase();
  const statutesBefore = (await pg.query("SELECT id, bill_status FROM taxcomp.law_statutes ORDER BY id")).rows;
  const pages = { index: INDEX, 561: stagePage({ title: "The Excise Duty (Amendment) Bill, 2026", cap: "Cap. 336", second: "21/04/2026" }), 555: stagePage({ title: "The Hides and Skins (Export Duty)(Amendment) Bill,2025.", second: "14/05/2025", third: "14/05/2025", assent: "30/06/2025" }) };
  const tracker = fakeTracker(pages);
  const env = { LAW_WATCH_FETCH: tracker.fetchImpl, LAW_WATCH_DELAY_MS: 0 };

  const first = await runLawWatch(db, env, new Date("2026-11-11T02:15:00Z"));
  assert.deepEqual({ checked: first.checked, taxBills: first.taxBills, changes: first.changes, errors: first.errors }, { checked: 2, taxBills: 2, changes: 2, errors: [] });
  assert.ok(!tracker.calls.some((c) => c.url.includes("billid=560")), "non-tax Bills are not read");
  assert.ok(tracker.calls.every((c) => /^TaxComp-LawWatch\//.test(c.ua)), "every request identifies TaxComp");
  const rows = (await pg.query("SELECT bill_id, stage, assent_date, review_status, cap_references_json FROM taxcomp.law_watch_bills ORDER BY bill_id")).rows;
  assert.deepEqual(rows, [
    { bill_id: 555, stage: "assented", assent_date: "2025-06-30", review_status: "new", cap_references_json: "[]" },
    { bill_id: 561, stage: "second_reading", assent_date: null, review_status: "new", cap_references_json: '["Cap. 336"]' },
  ]);

  // Nothing new: no events. Then Parliament passes the Bill: one stage change.
  assert.equal((await runLawWatch(db, env, new Date("2026-11-12T02:15:00Z"))).changes, 0);
  await pg.query("UPDATE taxcomp.law_watch_bills SET review_status = 'reviewed'");
  pages[561] = stagePage({ title: "The Excise Duty (Amendment) Bill, 2026", cap: "Cap. 336", second: "21/04/2026", third: "21/04/2026" });
  const third = await runLawWatch(db, env, new Date("2026-11-13T02:15:00Z"));
  assert.equal(third.changes, 1);
  const events = (await pg.query("SELECT bill_id, kind, from_stage, to_stage FROM taxcomp.law_watch_events ORDER BY detected_at, bill_id")).rows;
  assert.deepEqual(events.at(-1), { bill_id: 561, kind: "stage_change", from_stage: "second_reading", to_stage: "passed" });
  assert.equal((await pg.query("SELECT review_status FROM taxcomp.law_watch_bills WHERE bill_id = 561")).rows[0].review_status, "new", "a change re-opens review");
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM taxcomp.law_watch_runs")).rows[0].n, 3);
  assert.deepEqual((await pg.query("SELECT id, bill_status FROM taxcomp.law_statutes ORDER BY id")).rows, statutesBefore, "the law register is never changed by the watch");

  // robots.txt that forbids the pages stops the run before any Bill is read.
  const blocked = await runLawWatch(db, { LAW_WATCH_FETCH: async (url) => new URL(url).pathname === "/robots.txt" ? new Response("User-agent: *\nDisallow: /", { status: 200 }) : new Response("x"), LAW_WATCH_DELAY_MS: 0 });
  assert.equal(blocked.skippedByRobots, true);
  await pg.close();
});

test("reviewer API: list and mark changes; only approvers run it; owners see nothing", async () => {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const tracker = fakeTracker({ index: INDEX, 561: stagePage({ title: "The Excise Duty (Amendment) Bill, 2026", cap: "Cap. 336" }), 555: stagePage({ title: "The Hides and Skins (Export Duty)(Amendment) Bill,2025." }) });
  const origin = "https://taxcomp.example.invalid";
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch,
    CHAT_LIMITER: { limit: async () => ({ success: true }) }, LAW_WATCH_FETCH: tracker.fetchImpl, LAW_WATCH_DELAY_MS: 0 };
  const call = async (path, token, { method = "GET", body } = {}) => {
    const headers = { Origin: origin, Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: response.status, json: await response.json() };
  };
  const owner = await supabase.issueToken({ email: "owner@example.com" });
  const reviewer = await supabase.issueToken({ email: "reviewer@example.com" });
  assert.equal((await call("/api/challenge/review/lawwatch", owner.token)).status, 403);
  await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, 'reviewer@example.com', now()::text)", [reviewer.userId]);
  assert.equal((await call("/api/challenge/review/lawwatch/run", reviewer.token, { method: "POST" })).status, 403, "running needs approver rights");
  await pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1");
  const run = await call("/api/challenge/review/lawwatch/run", reviewer.token, { method: "POST" });
  assert.equal(run.status, 200, JSON.stringify(run.json));
  assert.equal(run.json.result.checked, 2);
  const list = await call("/api/challenge/review/lawwatch", reviewer.token);
  assert.equal(list.json.bills.length, 2);
  assert.deepEqual(list.json.bills.find((b) => b.billId === 561).capReferences, ["Cap. 336"]);
  assert.equal(list.json.lastRun.checked, 2);
  assert.match(list.json.stageLabels.passed, /not yet law/);
  assert.equal((await call("/api/challenge/review/lawwatch/561", reviewer.token, { method: "POST", body: { status: "maybe" } })).status, 400);
  assert.equal((await call("/api/challenge/review/lawwatch/561", reviewer.token, { method: "POST", body: { status: "reviewed", note: "Checked: still a Bill." } })).status, 200);
  const audit = await pg.query("SELECT action FROM taxcomp.challenge_audit_log WHERE action LIKE 'lawwatch.%' ORDER BY action");
  assert.deepEqual(audit.rows.map((r) => r.action), ["lawwatch.review", "lawwatch.run"]);
  await pg.close();
});
