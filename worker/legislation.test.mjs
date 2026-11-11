// Legislative knowledge engine: migrations and import, integrity, the public
// API, the reviewer workflow, editions, and retrieval by the AI assistant.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildImportSql, enablingSections } from "../scripts/legislation-import.mjs";
import { checkCitations, chooseEdition, legislationEvidence, legislationSummary, retrieveLegislation, subjectTerms } from "./challenge/legislation.mts";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const origin = "https://taxcomp.example.invalid";
const TODAY = new Date("2026-11-12T08:00:00Z");
const index = JSON.parse(readFileSync(new URL("../law-index.json", import.meta.url), "utf8"));
const one = async (pg, sql, params) => (await pg.query(sql, params)).rows[0];

function envFor(db, extra = {}) {
  return { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, CHAT_LIMITER: { limit: async () => ({ success: true }) }, CHALLENGE_CLOCK: () => TODAY, ...extra };
}
async function get(env, path, { origin: from = origin } = {}) {
  const response = await handleRequest(new Request(`https://worker.example${path}`, { headers: { Origin: from } }), env);
  return { status: response.status, json: await response.json(), headers: response.headers };
}

test("import: 18 laws, 701 sections, schedules and relations, all unverified, with history", async () => {
  const { pg } = await createMigratedDatabase();
  const counts = await one(pg, `SELECT (SELECT count(*)::int FROM taxcomp.legislation_laws) laws, (SELECT count(*)::int FROM taxcomp.legislation_law_versions) versions,
    (SELECT count(*)::int FROM taxcomp.legislation_sections) sections, (SELECT count(*)::int FROM taxcomp.legislation_schedules) schedules,
    (SELECT count(*)::int FROM taxcomp.legislation_sections WHERE verification_status <> 'unverified') touched,
    (SELECT count(*)::int FROM taxcomp.legislation_sections WHERE wording IS NOT NULL) worded,
    (SELECT count(*)::int FROM taxcomp.legislation_history WHERE action = 'imported' AND entity_type <> 'amendment') history`);
  const expectedSchedules = index.instruments.reduce((n, i) => n + i.schedules.length, 0);
  assert.deepEqual(counts, { laws: 18, versions: 18, sections: 701, schedules: expectedSchedules, touched: 0, worded: 0, history: 1 + 18 + 701 + expectedSchedules });
  // Every section count agrees with the captured index, per law.
  const perLaw = (await pg.query(`SELECT v.law_id, count(*)::int n FROM taxcomp.legislation_sections s JOIN taxcomp.legislation_law_versions v ON v.id = s.law_version_id GROUP BY v.law_id`)).rows;
  for (const law of index.instruments) assert.equal(perLaw.find((r) => r.law_id === law.id)?.n, law.sectionCount, law.id);
  // The register: five Acts added, TAT chapter corrected, every Act linked.
  assert.equal((await one(pg, "SELECT chapter FROM taxcomp.law_statutes WHERE id = 'tata'")).chapter, "Cap. 341");
  for (const id of ["sda", "lga", "cmaa", "eacop", "nssf"]) assert.ok(await one(pg, "SELECT 1 AS ok FROM taxcomp.law_statutes WHERE id = $1", [id]), id);
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_laws WHERE category = 'act' AND statute_id IS NULL")).n, 0);
  // Safeguards: 118I and 40E kept as captured and flagged; the LST gap recorded; the edition is historical.
  const flagged = (await pg.query("SELECT id FROM taxcomp.legislation_sections WHERE flags_json LIKE '%numbering-check%' ORDER BY id")).rows.map((r) => r.id);
  assert.deepEqual(flagged, ["ug-rev-2024/ita/s118I", "ug-rev-2024/tpca/s40E"]);
  assert.ok(await one(pg, "SELECT 1 AS ok FROM taxcomp.legislation_coverage_gaps WHERE id = 'ug-local-service-tax' AND kind = 'not_captured'"));
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_laws WHERE short_title ILIKE '%local government%'")).n, 0, "Local Service Tax is not passed off as captured");
  assert.deepEqual(await one(pg, "SELECT effective_from, effective_to, verification_status FROM taxcomp.legislation_editions WHERE id = 'ug-rev-2024'"), { effective_from: "2024-07-01", effective_to: "2025-06-30", verification_status: "unverified" });
  // Relations: enabling provisions are confirmed; heading-based links are inferred.
  const basis = (await pg.query("SELECT basis, count(*)::int n FROM taxcomp.legislation_relations GROUP BY basis ORDER BY basis")).rows;
  assert.ok(basis.find((r) => r.basis === "confirmed").n >= 10 && basis.find((r) => r.basis === "inferred").n >= 5);
  assert.ok(await one(pg, "SELECT 1 AS ok FROM taxcomp.legislation_relations WHERE from_law_id = 'ita-reg-transfer-pricing-2011' AND to_section_id = 'ug-rev-2024/ita/s116' AND basis = 'confirmed'"));
  assert.deepEqual(enablingSections("Under sections 21(1)(z)(ii)(B) and 151 of the Income Tax Act"), ["21", "151"]);
  await pg.close();
});

test("integrity: duplicates and orphans are refused; re-import is idempotent and never overwrites reviewed records", async () => {
  const { pg } = await createMigratedDatabase();
  await assert.rejects(pg.query(`INSERT INTO taxcomp.legislation_sections (id, law_version_id, section_number, heading, position, updated_at) VALUES ('dup', 'ug-rev-2024/ita', '80', 'Copy', 999, 'now')`), /unique|duplicate/i);
  await assert.rejects(pg.query(`INSERT INTO taxcomp.legislation_sections (id, law_version_id, section_number, heading, position, updated_at) VALUES ('orphan', 'no-edition/ita', '1', 'X', 1, 'now')`), /foreign key/i);
  await assert.rejects(pg.query(`UPDATE taxcomp.legislation_sections SET verification_status = 'verified' WHERE id = 'ug-rev-2024/ita/s80'`), /check/i, "verified needs who, when and the official source");
  await assert.rejects(pg.query(`UPDATE taxcomp.legislation_sections SET wording = 'some words' WHERE id = 'ug-rev-2024/ita/s80'`), /check/i, "wording needs a wording status");
  // A reviewer has worked on s.80; a later import with a different heading must not overwrite it.
  await pg.query(`UPDATE taxcomp.legislation_sections SET verification_status = 'under_review', verification_note = 'checking', updated_by = 'reviewer-1', updated_at = '2026-11-12T03:00:00Z' WHERE id = 'ug-rev-2024/ita/s80'`);
  const changed = structuredClone(index);
  const ita = changed.instruments.find((i) => i.id === "ita");
  for (const part of ita.parts) for (const d of part.divisions) for (const item of d.items) {
    if (item.section === "80") item.heading = "Foreign tax credit (renamed)";
    if (item.section === "79") item.heading = "Foreign source employment income (renamed)";
  }
  const sql = buildImportSql(changed, { id: "ug-rev-2024", label: "Laws of Uganda, Revised Edition 2024 (as in force for FY 2024/25)", effectiveFrom: "2024-07-01", effectiveTo: "2025-06-30", importedAt: "2026-11-12T04:00:00Z" });
  await pg.exec(sql);
  await pg.exec(sql); // twice: idempotent
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_sections")).n, 701);
  assert.equal((await one(pg, "SELECT heading FROM taxcomp.legislation_sections WHERE id = 'ug-rev-2024/ita/s80'")).heading, "Foreign tax credit", "reviewed record kept");
  assert.equal((await one(pg, "SELECT heading FROM taxcomp.legislation_sections WHERE id = 'ug-rev-2024/ita/s79'")).heading, "Foreign source employment income (renamed)", "unverified record updated");
  const history = (await pg.query("SELECT action, from_value, to_value, actor FROM taxcomp.legislation_history WHERE entity_id = 'ug-rev-2024/ita/s79' ORDER BY occurred_at")).rows;
  assert.deepEqual(history.map((h) => h.action), ["imported", "content_changed"], "one change logged, not two");
  assert.match(history[1].to_value, /renamed/);
  assert.equal(history[1].actor, "import:ug-rev-2024");
  await assert.rejects(pg.query("UPDATE taxcomp.legislation_history SET note = 'x'").then(() => pg.query("SET ROLE taxcomp_worker")).then(() => pg.query("DELETE FROM taxcomp.legislation_history")), /permission denied/i);
  await pg.close();
});

test("public API: list, Act, sections, schedules, related, verification, search, validation", async () => {
  const { pg, db } = await createMigratedDatabase();
  const env = envFor(db);
  const list = await get(env, "/api/legislation");
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 18);
  assert.equal(list.json.laws.length, 18);
  assert.equal(list.json.edition.id, "ug-rev-2024");
  assert.equal(list.json.edition.match, "latest-captured");
  assert.match(list.json.edition.warning, /may not reflect the law in force on 2026-11-12/);
  const ita = list.json.laws.find((l) => l.id === "ita");
  // Amended from 1 July 2026, so the 2024 version is flagged for amendment review.
  assert.deepEqual([ita.chapter, ita.sectionCount, ita.verificationStatus, ita.commencementDate], ["Cap. 338", 156, "requires_amendment_review", "1997-07-01"]);
  assert.equal(list.json.laws.find((l) => l.id === "nssf").verificationStatus, "unverified", "laws without 2026 amendments are unchanged");
  assert.ok(ita.laterAmendments.some((a) => a.statuteId === "ita-amendment-2026"), "2026 amendment flagged as not captured");
  assert.equal(list.json.laws.find((l) => l.id === "tata").chapter, "Cap. 341");
  assert.equal((await get(env, "/api/legislation?category=regulations&pageSize=5")).json.total, 8);
  assert.equal((await get(env, "/api/legislation?pageSize=5&page=2")).json.laws.length, 5);

  const act = await get(env, "/api/legislation/ita");
  assert.equal(act.json.parts.find((p) => p.number === "IX").title, "International Taxation");
  assert.equal(act.json.schedules.length, index.instruments.find((i) => i.id === "ita").schedules.length);
  assert.ok(act.json.related.some((r) => r.from.lawId === "ita-reg-transfer-pricing-2011" && r.basis === "confirmed"));
  const part9 = await get(env, "/api/legislation/ita/sections?part=IX&pageSize=50");
  assert.ok(part9.json.sections.some((s) => s.sectionNumber === "80" && s.heading === "Foreign tax credit"));
  const page = await get(env, "/api/legislation/ita/sections?pageSize=10&page=2");
  assert.equal(page.json.sections[0].position, 11);
  assert.equal(page.json.total, 156);
  const s80 = await get(env, "/api/legislation/ita/sections/80");
  assert.deepEqual([s80.json.section.citation, s80.json.section.evidenceLevel, s80.json.section.wording], ["Income Tax Act (Cap. 338), s.80", "unverified_structure", null]);
  assert.ok(s80.json.related.some((r) => r.to.section === "88" && r.basis === "inferred"));
  assert.ok((await get(env, "/api/legislation/ita/sections/118I")).json.section.flags.includes("numbering-check"));
  assert.equal((await get(env, "/api/legislation/vata/schedules")).json.schedules.length, index.instruments.find((i) => i.id === "vata").schedules.length);
  assert.deepEqual((await get(env, "/api/legislation/ita/verification")).json.sections, { unverified: 156 });

  const search = async (q) => (await get(env, `/api/legislation/search?q=${encodeURIComponent(q)}`)).json;
  const ftc = await search("foreign tax credit");
  assert.deepEqual([ftc.results[0].lawId, ftc.results[0].sectionNumber, ftc.results[0].heading], ["ita", "80", "Foreign tax credit"]);
  const intl = await search("international payments");
  assert.deepEqual([intl.results[0].lawId, intl.results[0].sectionNumber], ["ita", "82"]);
  assert.ok(intl.results.some((r) => r.sectionNumber === "137"));
  const vat = await search("place of supply of services");
  assert.deepEqual([vat.results[0].lawId, vat.results[0].sectionNumber, vat.results[0].heading], ["vata", "16", "Place of supply of services"]);
  assert.equal((await search("section 16 value added tax")).results[0].lawId, "vata", "number search ranks the named Act first");
  assert.equal((await search("objection appeal tribunal zzz")).mode, "any-word");

  const editions = await get(env, "/api/legislation/editions");
  assert.ok(editions.json.gaps.some((g) => g.id === "ug-local-service-tax"));
  assert.equal((await get(env, "/api/legislation?onDate=2024-10-01")).json.edition.match, "covers-date");
  assert.equal((await get(env, "/api/legislation?onDate=2024-10-01")).json.edition.warning, null);
  assert.equal((await get(env, "/api/legislation?onDate=2020-01-01")).status, 404, "no edition before 2024-07-01");

  for (const bad of ["/api/legislation/search?q=a", "/api/legislation?pageSize=1000", "/api/legislation?onDate=12-11-2026", "/api/legislation?edition=BAD!", "/api/legislation/ita/sections?part=9"]) {
    assert.equal((await get(env, bad)).status, 400, bad);
  }
  assert.equal((await get(env, "/api/legislation/nope")).status, 404);
  assert.equal((await get(env, "/api/legislation/ita/sections/999")).status, 404);
  assert.equal((await get(env, "/api/legislation", { origin: "https://evil.example" })).status, 403);
  const post = await handleRequest(new Request("https://worker.example/api/legislation", { method: "POST", headers: { Origin: origin } }), env);
  assert.equal(post.status, 405, "read-only: no admin operations in the public API");
  assert.equal((await get({ ...env, DATABASE_PROVIDER: "d1" }, "/api/legislation")).status, 503);
  await pg.close();
});

test("verification workflow: owners cannot; reviewers mark under review; only approvers verify, with a source; all logged", async () => {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const env = envFor(db, { SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch });
  const call = async (path, token, { method = "GET", body } = {}) => {
    const headers = { Origin: origin, Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: response.status, json: await response.json() };
  };
  const owner = await supabase.issueToken({ email: "owner@example.com" });
  const reviewer = await supabase.issueToken({ email: "reviewer@example.com" });
  const law = "/api/challenge/review/legislation/ug-rev-2024/ita";
  assert.equal((await call("/api/challenge/review/legislation", owner.token)).status, 403);
  assert.equal((await call(`${law}/status`, owner.token, { method: "POST", body: { status: "verified" } })).status, 403);

  await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, 'reviewer@example.com', now()::text)", [reviewer.userId]);
  const queue = await call("/api/challenge/review/legislation?flagged=1", reviewer.token);
  assert.deepEqual(queue.json.sections.map((s) => s.id), ["ug-rev-2024/ita/s118I", "ug-rev-2024/tpca/s40E"]);
  assert.equal(queue.json.laws.length, 18);
  assert.equal((await call(`${law}/status`, reviewer.token, { method: "POST", body: { status: "under_review", note: "Comparing with ULRC 2024." } })).status, 200);
  assert.equal((await call(`${law}/status`, reviewer.token, { method: "POST", body: { status: "verified", note: "Checked.", officialSourceUrl: "https://ulrc.go.ug/" } })).status, 403);
  assert.equal((await call(`${law}/sections/118I/status`, reviewer.token, { method: "POST", body: { status: "requires_amendment_review", note: "Pre-revision numbering." } })).status, 200);
  assert.equal((await call(`${law}/sections/80/status`, reviewer.token, { method: "POST", body: { status: "under_review", heading: "Changed" } })).status, 403, "headings: approvers only");

  await pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1");
  assert.equal((await call(`${law}/status`, reviewer.token, { method: "POST", body: { status: "verified", note: "ok" } })).status, 400, "verifying needs the source and a note");
  assert.equal((await call(`${law}/status`, reviewer.token, { method: "POST", body: { status: "verified", note: "Chapter and arrangement checked against ULRC 2024 edition.", officialSourceUrl: "https://ulrc.go.ug/principal-laws", chapter: "Cap 338" } })).status, 400, "chapter format");
  const ok = await call(`${law}/status`, reviewer.token, { method: "POST", body: { status: "verified", note: "Chapter and arrangement checked against ULRC 2024 edition.", officialSourceUrl: "https://ulrc.go.ug/principal-laws", chapter: "Cap. 338", commencementDate: "1997-07-01" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const s16 = await call("/api/challenge/review/legislation/ug-rev-2024/vata/sections/16/status", reviewer.token, { method: "POST", body: { status: "verified", note: "Heading checked against the official text.", officialSourceUrl: "https://ulrc.go.ug/vat",
    wording: "Official wording pasted here for the test.", wordingSourceUrl: "https://ulrc.go.ug/vat#s16", wordingVerified: true } });
  assert.equal(s16.status, 200);
  const row = await one(pg, "SELECT verification_status, verified_by, wording_status FROM taxcomp.legislation_sections WHERE id = 'ug-rev-2024/vata/s16'");
  assert.deepEqual([row.verification_status, row.verified_by, row.wording_status], ["verified", reviewer.userId, "verified"]);
  const pub = await get(env, "/api/legislation/vata/sections/16");
  assert.equal(pub.json.section.evidenceLevel, "verified_wording");

  const history = await call("/api/challenge/review/legislation/history?id=ug-rev-2024/ita", reviewer.token);
  // imported; flagged by the 2026 amendments migration; under review; verified.
  assert.deepEqual(history.json.history.map((h) => h.action).sort(), ["imported", "status_changed", "status_changed", "status_changed"], "confirming the same chapter and date is not a content change");
  assert.ok(history.json.history.some((h) => h.toStatus === "verified" && h.actor === reviewer.userId));
  const audit = (await pg.query("SELECT action FROM taxcomp.challenge_audit_log WHERE action LIKE 'legislation.%'")).rows.length;
  assert.equal(audit, 4);

  // Edition comparison: a later edition (as an import would create) shows what changed.
  const next = structuredClone(index);
  const vata = next.instruments.find((i) => i.id === "vata");
  vata.parts[0].divisions[0].items.push({ section: "3A", heading: "A new section" });
  vata.sectionCount += 1;
  vata.parts.at(-1).divisions.at(-1).items.pop();
  vata.sectionCount -= 1;
  await pg.exec(buildImportSql(next, { id: "ug-cons-2026", label: "Consolidation as at FY 2026/27 (test)", effectiveFrom: "2026-07-01", effectiveTo: null, importedAt: "2026-11-12T05:00:00Z" }));
  const diff = await call("/api/challenge/review/legislation/compare?law=vata&from=ug-rev-2024&to=ug-cons-2026", reviewer.token);
  assert.deepEqual([diff.json.added.map((a) => a.section), diff.json.removed.map((a) => a.section), diff.json.changed.length], [["3A"], ["53"], 0]);
  // Historical selection: a 2024 date gets the 2024 edition; today gets the new one.
  assert.equal((await get(env, "/api/legislation?onDate=2024-10-01")).json.edition.id, "ug-rev-2024");
  assert.equal((await get(env, "/api/legislation")).json.edition.id, "ug-cons-2026");
  assert.equal((await get(env, "/api/legislation/vata/sections/16?edition=ug-rev-2024")).json.section.evidenceLevel, "verified_wording", "verification stays with its edition");
  await pg.close();
});

test("AI retrieval: the three example questions retrieve real records and disclose what is missing", async () => {
  const { pg, db } = await createMigratedDatabase();
  const today = "2026-11-12";
  assert.equal(subjectTerms("What is a foreign tax credit in Uganda?"), "foreign credit");
  const ftc = await retrieveLegislation(db, "What is a foreign tax credit in Uganda?", { today });
  assert.equal(ftc.provisions[0].citation, "Income Tax Act (Cap. 338), s.80");
  assert.equal(ftc.provisions[0].evidenceLevel, "unverified_structure");
  assert.ok(ftc.provisions.some((p) => p.sectionNumber === "88" && p.relationBasis === "inferred"), "related provision found");
  assert.ok(ftc.laterAmendments.ita.some((a) => a.statuteId === "ita-amendment-2026"));
  const evidence = legislationEvidence(ftc);
  assert.match(evidence, /\[L1\] Income Tax Act \(Cap\. 338\), s\.80 – Foreign tax credit/);
  assert.match(evidence, /does not give its conditions, rates or effect/);
  assert.match(evidence, /may not reflect the law in force on 2026-11-12/);
  const summary = legislationSummary(ftc);
  assert.match(summary, /Only the section headings are held, not the wording/);
  assert.match(summary, /Income Tax \(Amendment\) Act, 2026/);

  const intl = await retrieveLegislation(db, "How are international payments taxed in Uganda?", { today });
  assert.equal(intl.provisions[0].sectionNumber, "82");
  assert.ok(intl.provisions.some((p) => p.sectionNumber === "137"), "the withholding provision is related");
  assert.doesNotMatch(legislationSummary(intl), /\d\s?%/, "a heading never becomes a rate");

  const vat = await retrieveLegislation(db, "Where are services supplied for VAT purposes?", { today });
  assert.deepEqual([vat.provisions[0].lawId, vat.provisions[0].sectionNumber], ["vata", "16"]);
  assert.match(legislationSummary(vat), /needs the facts of the transaction/);

  const lst = await retrieveLegislation(db, "How much local service tax does an employee pay?", { today });
  assert.ok(lst.gaps.some((g) => g.id === "ug-local-service-tax"), "missing legislation is reported, not invented");
  const historical = await retrieveLegislation(db, "foreign tax credit", { today, onDate: "2024-07-01" });
  assert.equal(historical.edition.match, "covers-date");
  assert.equal(historical.edition.warning, null);

  // Citation guard: [L#] markers become citations; unretrieved sections are flagged.
  const checked = checkCitations("A credit is allowed [L1]. See also section 999 and s.88.", ftc);
  assert.match(checked.answer, /\(Income Tax Act \(Cap\. 338\), s\.80\)/);
  assert.deepEqual(checked.unmatched, ["999"]);
  assert.match(checked.answer, /could not match section 999/);
  assert.equal(chooseEdition([], { today }).match, "none");
  await pg.close();
});

test("2026 amendments register: Bill and reported figures side by side, conflicts flagged, retrieval, review", async () => {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const counts = await one(pg, `SELECT count(*)::int total, count(*) FILTER (WHERE figures_differ = 1)::int differ, count(*) FILTER (WHERE verification_status <> 'unverified')::int touched,
    count(*) FILTER (WHERE evidence = 'bill_only')::int bill_only FROM taxcomp.legislation_amendments`);
  assert.deepEqual(counts, { total: 53, differ: 5, touched: 0, bill_only: 8 });
  // Every record names its Bill; every record with a law link points at a captured law.
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_amendments WHERE bill_reference = '' OR bill_url IS NULL")).n, 0);
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_history WHERE entity_type = 'amendment' AND action = 'imported'")).n, 53);
  // The VAT conflict is recorded both ways, never resolved.
  const vat = await one(pg, "SELECT bill_figure, reported_figure, figures_differ FROM taxcomp.legislation_amendments WHERE id = 'vat-2026-s7-registration-threshold'");
  assert.deepEqual(vat, { bill_figure: "UGX 250,000,000", reported_figure: "UGX 300,000,000", figures_differ: 1 });
  // The register: chapters from the Bills; the Excise Act is not promoted to assented.
  assert.equal((await one(pg, "SELECT chapter FROM taxcomp.law_statutes WHERE id = 'eta'")).chapter, "Cap. 69");
  assert.equal((await one(pg, "SELECT bill_status FROM taxcomp.law_statutes WHERE id = 'eda-amendment-2026'")).bill_status, "passed");
  assert.match((await one(pg, "SELECT note FROM taxcomp.law_statutes WHERE id = 'vata-amendment-2026'")).note, /Cap\. 344 \(not Cap\. 349/);
  // Re-running the migration does not duplicate the notes it appends.
  await pg.exec(readFileSync(new URL("../supabase/migrations/20261112000500_amendments_2026.sql", import.meta.url), "utf8"));
  assert.equal(((await one(pg, "SELECT note FROM taxcomp.law_statutes WHERE id = 'eda-amendment-2026'")).note.match(/Web check/g) || []).length, 1);
  assert.equal((await one(pg, "SELECT count(*)::int n FROM taxcomp.legislation_amendments")).n, 53);

  // Public API.
  const env = envFor(db);
  const all = await get(env, "/api/legislation/amendments");
  assert.equal(all.status, 200);
  assert.equal(all.json.total, 53);
  assert.deepEqual(all.json.acts.map((a) => a.id), ["ita-amendment-2026", "vata-amendment-2026", "eda-amendment-2026", "sda-amendment-2026", "tpca-amendment-2026", "lga-amendment-2026", "eta-amendment-2026", "trsa-amendment-2026"]);
  assert.equal(all.json.acts.find((a) => a.id === "eda-amendment-2026").conflicts, 2);
  const differ = await get(env, "/api/legislation/amendments?differ=1");
  assert.deepEqual(differ.json.amendments.map((a) => a.id).sort(), ["eda-2026-cement", "eda-2026-sugar", "sda-2026-item67-vehicles", "tpc-2026-s47d-waiver-2025", "vat-2026-s7-registration-threshold"]);
  assert.equal((await get(env, "/api/legislation/amendments?law=vata")).json.total, 9);
  assert.equal((await get(env, "/api/legislation/amendments?law=BAD!")).status, 400);

  // Retrieval: the threshold question gets the change with both figures; a Bill-only change is labelled as such.
  const threshold = await retrieveLegislation(db, "What is the VAT registration threshold?", { today: "2026-11-12" });
  assert.equal(threshold.amendments[0].id, "vat-2026-s7-registration-threshold");
  const evidence = legislationEvidence(threshold);
  assert.match(evidence, /\[A1\] 2026 change: Value Added Tax Act, Cap\. 344, s\.7\(2\)/);
  assert.match(evidence, /Published Bill: UGX 250,000,000\. Reported as enacted: UGX 300,000,000\. The Bill and the reported enactment differ/);
  assert.match(evidence, /never pick one/);
  assert.match(legislationSummary(threshold), /Changes made in 2026/);
  const loss = await retrieveLegislation(db, "Is there a minimum tax on assessed losses carried forward under the income tax?", { today: "2026-11-12" });
  assert.ok(loss.amendments.some((a) => a.id === "ita-2026-s36-loss-minimum-tax"));
  assert.match(legislationSummary(loss), /published Bill only and may not have been enacted/);
  const worn = await retrieveLegislation(db, "What levy applies to imported worn clothing?", { today: "2026-11-12" });
  assert.equal(worn.amendments[0]?.id, "eta-2026-worn-clothing-levy", "laws outside the database are still found");
  // [A#] markers become citations; section numbers from the register are known.
  const checked = checkCitations("The threshold was raised [A1] by section 7.", threshold);
  assert.match(checked.answer, /\(Value Added Tax Act, Cap\. 344, s\.7\(2\), as amended in 2026; unverified\)/);
  assert.deepEqual(checked.unmatched, []);

  // Review: reviewers mark under review; only approvers verify, with the source; logged.
  const supabase = await createFakeSupabase(pg);
  const renv = envFor(db, { SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch });
  const reviewer = await supabase.issueToken({ email: "reviewer@example.com" });
  await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, 'reviewer@example.com', now()::text)", [reviewer.userId]);
  const post = async (path, body) => {
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${reviewer.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }), renv);
    return { status: response.status, json: await response.json() };
  };
  const path = "/api/challenge/review/legislation/amendments/vat-2026-s7-registration-threshold/status";
  assert.equal((await post(path, { status: "under_review", note: "Waiting for the gazetted Act." })).status, 200);
  assert.equal((await post(path, { status: "verified", note: "Checked.", officialSourceUrl: "https://example.org/act" })).status, 403);
  assert.equal((await post("/api/challenge/review/legislation/amendments/no-such-change/status", { status: "under_review" })).status, 404);
  await pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1");
  assert.equal((await post(path, { status: "verified", note: "Section 7(2) as enacted reads 300 million; checked.", officialSourceUrl: "https://example.org/vat-amendment-act-2026" })).status, 200);
  const statuses = (await pg.query("SELECT to_status FROM taxcomp.legislation_history WHERE entity_id = 'vat-2026-s7-registration-threshold' AND action = 'status_changed' ORDER BY occurred_at, to_status")).rows.map((r) => r.to_status);
  assert.deepEqual(statuses.sort(), ["under_review", "verified"]);
  // A reviewed record is not overwritten by re-running the migration.
  await pg.exec(readFileSync(new URL("../supabase/migrations/20261112000500_amendments_2026.sql", import.meta.url), "utf8"));
  assert.equal((await one(pg, "SELECT verification_status FROM taxcomp.legislation_amendments WHERE id = 'vat-2026-s7-registration-threshold'")).verification_status, "verified");
  await pg.close();
});

test("chat: answers cite the database records and say what is unverified (local answer and AI answer)", async () => {
  const { pg, db } = await createMigratedDatabase();
  const env = envFor(db, { GEMINI_API_KEY: "", PREMIUM_ACCESS_CHECK: async () => true });
  const ask = async (message, environment = env, extra = {}) => {
    const response = await handleRequest(new Request("https://worker.example/chat", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" }, body: JSON.stringify({ message, providerConsent: false, ...extra }),
    }), environment);
    return response.json();
  };
  const local = await ask("What is a foreign tax credit in Uganda?");
  assert.match(local.answer, /Income Tax Act \(Cap\. 338\), s\.80 – Foreign tax credit/);
  assert.match(local.answer, /cannot state the conditions, rates or legal effect/);
  assert.equal(local.legislation.provisions[0].evidenceLevel, "unverified_structure");
  assert.equal(local.legislation.edition.id, "ug-rev-2024");
  assert.equal(local.sourceIndicators[0].kind, "legislation_database");
  assert.equal(local.verificationRequired, true);
  const old = await ask("What is a foreign tax credit in Uganda?", env, { taxPeriod: "2024/25" });
  assert.equal(old.legislation.edition.match, "covers-date");
  // The evidence-first advisor (tried first by the site's chat) retrieves the same records.
  const advisorResponse = await handleRequest(new Request("https://worker.example/advisor", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" }, body: JSON.stringify({ message: "How are international payments taxed in Uganda?", providerConsent: false }),
  }), env);
  const advisor = await advisorResponse.json();
  assert.equal(advisor.answerSource, "advisor");
  assert.equal(advisor.legislation.provisions[0].citation, "Income Tax Act (Cap. 338), s.82");
  assert.match(advisor.answer, /^Relevant provisions found in TaxComp's legislative database/);
  assert.equal(advisor.sourceIndicators[0].kind, "legislation_database");
  assert.equal(advisor.verificationRequired, true);

  const originalFetch = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body).systemInstruction.parts[0].text;
    const text = "Uganda gives relief for foreign tax [L1]. Section 77 defines terms.";
    return Response.json({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://www.ura.go.ug/", title: "URA" } }], groundingSupports: [{ segment: { endIndex: text.length }, groundingChunkIndices: [0] }] } }] });
  };
  try {
    const ai = await ask("What is a foreign tax credit in Uganda?", { ...env, GEMINI_API_KEY: "test-key-not-a-real-secret", GEMINI_MODEL: "gemini-test" }, { providerConsent: true });
    assert.match(prompt, /\[L1\] Income Tax Act \(Cap\. 338\), s\.80/, "the model receives the retrieved records");
    assert.match(prompt, /cite Uganda legislation only from its \[L#\] entries/);
    assert.match(ai.answer, /relief for foreign tax \(Income Tax Act \(Cap\. 338\), s\.80\)/);
    assert.match(ai.answer, /could not match section 77/);
    assert.deepEqual(ai.legislation.citationCheck.unmatched, ["77"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  await pg.close();
});
