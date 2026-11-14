// Knowledge base: copyright and licence guards, source-hierarchy ranking,
// the seeded drafts, database constraints, and the review workflow over HTTP.
import test from "node:test";
import assert from "node:assert/strict";
import { decide, rankRecords, validateRecord, authorityRank } from "./challenge/knowledge.mts";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const base = {
  id: "intl.test-note", title: "Test note", layer: "international", country: "INTL", taxCategory: "double-taxation-relief", topic: "Credit method",
  sourceKind: "textbook", sourceOrganisation: "TaxComp", sourceReference: "Original note. Framework: Chapter 4", sourceUrl: null, chapterRef: "Chapter 4",
  statuteId: null, applicableFrom: null, applicableTo: null, effectiveDate: null, publicationDate: null, contentKind: "original_note",
  licence: "restricted_no_text", licenceNote: "", body: "Foreign tax is credited up to the domestic tax on the same income.", aiGenerated: true,
};
const longQuote = `"${Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ")}"`;

test("copyright guard: unlicensed sources take original notes only, no long quotes, no page numbers", () => {
  assert.deepEqual(validateRecord(base), []);
  assert.match(validateRecord({ ...base, body: `As the book says ${longQuote}` }).join(" "), /Do not quote/);
  assert.deepEqual(validateRecord({ ...base, body: 'A short phrase "arm\'s length" is fine.' }), []);
  assert.match(validateRecord({ ...base, chapterRef: "Chapter 4, p. 112" }).join(" "), /page numbers/);
  assert.match(validateRecord({ ...base, body: "See page 45." }).join(" "), /page numbers/);
  assert.match(validateRecord({ ...base, contentKind: "licensed_excerpt" }).join(" "), /licence set to licensed/);
  assert.match(validateRecord({ ...base, licence: "original_work", contentKind: "official_text" }).join(" "), /Official text must come/);
  assert.match(validateRecord({ ...base, licence: "original_work", contentKind: "licensed_excerpt", licenceNote: "x" }).join(" "), /licence set to licensed/);
  // With written permission on file, a short excerpt is allowed.
  assert.deepEqual(validateRecord({ ...base, aiGenerated: false, licence: "licensed", licenceNote: "Permission letter, ref KLI-2026-01", contentKind: "licensed_excerpt" }), []);
  assert.match(validateRecord({ ...base, licence: "licensed", licenceNote: "", contentKind: "licensed_excerpt", aiGenerated: false }).join(" "), /written permission/);
  assert.match(validateRecord({ ...base, contentKind: "metadata_only" }).join(" "), /no body text/);
  assert.match(validateRecord({ ...base, layer: "domestic" }).join(" "), /needs a country/);
  assert.match(validateRecord({ ...base, applicableFrom: "2026-07-01", applicableTo: "2026-06-30" }).join(" "), /ends before it starts/);
});

test("ranking: verified current law first, then the source hierarchy; drafts and old periods fall behind", () => {
  const rec = (id, sourceKind, extra = {}) => ({ ...base, id, title: id, sourceKind, status: "verified", body: "foreign tax credit relief", reviewedAt: "2026-11-12", ...extra });
  const records = [
    rec("textbook-note", "textbook"),
    rec("statute", "legislation", { country: "UG", layer: "domestic" }),
    rec("guidance", "official_guidance", { country: "UG", layer: "domestic" }),
    rec("draft-statute", "legislation", { country: "UG", layer: "domestic", status: "draft" }),
    rec("old-statute", "legislation", { country: "UG", layer: "domestic", applicableTo: "2025-06-30" }),
    rec("kenya", "legislation", { country: "KE", layer: "domestic" }),
  ];
  const order = rankRecords(records, { q: "foreign tax credit", country: "UG", onDate: "2026-11-12" }).map((r) => r.record.id);
  assert.deepEqual(order, ["statute", "guidance", "textbook-note", "draft-statute", "old-statute"], "Kenya law is excluded for a Uganda question");
  assert.equal(rankRecords(records, { q: "nothing matches zzz" }).length, 0);
  assert.ok(authorityRank("legislation", "UG") < authorityRank("treaty", "UG"));
  assert.ok(authorityRank("textbook", "UG") < authorityRank("ai_general", "UG"));
  assert.equal(decide("draft", "verify"), "verified");
  assert.equal(decide("draft", "outdated"), null, "only verified records can be retired");
  assert.equal(decide("verified", "outdated"), "outdated");
  assert.equal(decide("rejected", "verify"), null);
});

test("migration: seeds are drafts, the Primer is metadata only, and the database enforces the licence rules", async () => {
  const { pg } = await createMigratedDatabase();
  const seeded = (await pg.query("SELECT id, status, content_kind, licence, body, source_reference, chapter_ref, ai_generated FROM taxcomp.knowledge_records")).rows;
  assert.ok(seeded.length >= 40, `seeded ${seeded.length}`);
  assert.ok(seeded.every((r) => r.status === "draft"), "nothing is shown to users before review");
  const primer = seeded.find((r) => r.id === "primer-arnold-4e");
  assert.deepEqual([primer.content_kind, primer.licence, primer.body], ["metadata_only", "restricted_no_text", ""]);
  const notes = seeded.filter((r) => r.id.startsWith("intl."));
  assert.equal(notes.length, 23);
  for (const note of notes) {
    assert.equal(note.ai_generated, 1);
    assert.match(note.chapter_ref, /^Chapters? \d/);
    assert.deepEqual(validateRecord({ ...base, id: note.id, body: note.body, sourceReference: note.source_reference, chapterRef: note.chapter_ref, licence: note.licence }), [], note.id);
  }
  assert.ok(seeded.some((r) => r.id === "ug.vat.vata"), "domestic pointers link to the register");
  const events = (await pg.query("SELECT count(*)::int AS n FROM taxcomp.knowledge_record_events WHERE action = 'seeded'")).rows[0].n;
  assert.equal(events, seeded.length);
  await assert.rejects(pg.query(`INSERT INTO taxcomp.knowledge_records (id, title, layer, country, tax_category, source_kind, source_organisation, source_reference, content_kind, licence, body, created_at, updated_at)
    VALUES ('bad.excerpt', 'x', 'international', 'INTL', 'beps', 'textbook', 'Publisher', 'Book', 'licensed_excerpt', 'restricted_no_text', 'copied text', 'now', 'now')`), /knowledge_/);
  await assert.rejects(pg.query("UPDATE taxcomp.knowledge_records SET status = 'verified' WHERE id = 'intl.beps'"), /legal_two_person_required/, "verification needs an approved two-person request");
  await assert.rejects(pg.query("UPDATE taxcomp.knowledge_records SET status = 'verified', reviewed_by = 'x', reviewed_at = 'now' WHERE id = 'intl.beps'"), /legal_two_person_required/, "even with a reviewer named");
  await pg.close();
});

test("review workflow: reviewers draft, approvers verify, users see only verified records", async () => {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const origin = "https://taxcomp.example.invalid";
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch, CHAT_LIMITER: { limit: async () => ({ success: true }) } };
  const call = async (path, token, { method = "GET", body } = {}) => {
    const headers = { Origin: origin, Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: response.status, json: await response.json() };
  };
  const owner = await supabase.issueToken({ email: "owner@example.com" });
  const reviewer = await supabase.issueToken({ email: "reviewer@example.com", aal: "aal2" });

  const before = await call("/api/challenge/knowledge?q=foreign+tax+credit", owner.token);
  assert.equal(before.status, 200);
  assert.deepEqual(before.json.results, [], "seeded drafts are not shown");
  assert.equal(before.json.hierarchy[0].kind, "legislation");
  assert.equal((await call("/api/challenge/review/knowledge", owner.token)).status, 403);

  await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, 'reviewer@example.com', now()::text)", [reviewer.userId]);
  const drafts = await call("/api/challenge/knowledge?q=foreign+tax+credit&include=drafts", reviewer.token);
  assert.ok(drafts.json.results.some((r) => r.id === "intl.foreign-tax-credit"), "reviewers can see drafts");

  const bad = await call("/api/challenge/review/knowledge", reviewer.token, { method: "POST", body: { ...base, id: "intl.copied", body: `Quote: ${longQuote}` } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /Do not quote/);
  assert.equal((await call("/api/challenge/review/knowledge", reviewer.token, { method: "POST", body: { ...base, statuteId: "no-such-act" } })).status, 400);
  const saved = await call("/api/challenge/review/knowledge", reviewer.token, { method: "POST", body: base });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  // Phase 2b: verifying is PREPARED by any reviewer and DECIDED by a different legal approver.
  const approver = await supabase.issueToken({ email: "approver@example.com", aal: "aal2" });
  const third = await supabase.issueToken({ email: "third@example.com", aal: "aal2" });
  await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, 'approver@example.com', 1, now()::text), ($2, 'third@example.com', 1, now()::text)", [approver.userId, third.userId]);
  const decideAs = (token, requestId, decision = "approve") => call(`/api/challenge/review/register/requests/${requestId}/decision`, token, { method: "POST", body: { decision, note: "Checked the chapter reference." } });

  const lazy = await call("/api/challenge/review/knowledge/intl.foreign-tax-credit/decision", reviewer.token, { method: "POST", body: { decision: "verify" } });
  assert.equal(lazy.status, 400);
  assert.match(lazy.json.error, /written by AI/);
  const prepared = await call("/api/challenge/review/knowledge/intl.foreign-tax-credit/decision", reviewer.token, { method: "POST", body: { decision: "verify", note: "Checked against chapter 4 and the Income Tax Act." } });
  assert.equal(prepared.status, 202, JSON.stringify(prepared.json));
  assert.deepEqual((await call("/api/challenge/knowledge?q=foreign+tax+credit", owner.token)).json.results, [], "nothing is published until a second person approves");
  assert.equal((await decideAs(reviewer.token, prepared.json.request.id)).status, 403, "a reviewer without approver rights cannot decide");
  await pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1 WHERE user_id = $1", [reviewer.userId]);
  const own = await decideAs(reviewer.token, prepared.json.request.id);
  assert.equal(own.status, 403, "nobody approves their own submission");
  assert.match(own.json.error, /different legal approver/);
  const ok = await decideAs(approver.token, prepared.json.request.id);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.contentClass, "professional_commentary", "a verified note is commentary, never verified law");
  const after = await call("/api/challenge/knowledge?q=foreign+tax+credit&onDate=2026-11-12", owner.token);
  assert.deepEqual(after.json.results.map((r) => r.id), ["intl.foreign-tax-credit"]);
  const shown = after.json.results[0];
  assert.equal(shown.current, true);
  assert.equal(shown.legalClassLabel, "Professional commentary");
  assert.match(shown.chapterRef, /Chapter 4/);
  assert.ok(shown.lastReviewed);
  assert.equal(shown.licenceNote, undefined, "internal licence notes are not published");

  // The reviewer's own note: its author cannot be the independent approver, even when someone else submits it.
  const ownNote = await call(`/api/challenge/review/knowledge/${base.id}/decision`, approver.token, { method: "POST", body: { decision: "verify", note: "Own note, checked against chapter 4." } });
  assert.equal(ownNote.status, 202);
  const byAuthor = await decideAs(reviewer.token, ownNote.json.request.id);
  assert.equal(byAuthor.status, 403);
  assert.match(byAuthor.json.error, /wrote or entered this content/);
  assert.equal((await decideAs(third.token, ownNote.json.request.id)).status, 200);
  // Retire the first record in favour of the reviewer's: also two people.
  const retired = await call("/api/challenge/review/knowledge/intl.foreign-tax-credit/decision", reviewer.token, { method: "POST", body: { decision: "outdated", supersededBy: base.id, note: "Replaced by the reviewer's own note." } });
  assert.equal(retired.status, 202);
  assert.equal((await decideAs(approver.token, retired.json.request.id)).status, 200);
  const marked = (await call("/api/challenge/knowledge?q=foreign+tax+credit", owner.token)).json.results;
  assert.deepEqual(marked.map((r) => [r.id, r.status, r.current]), [[base.id, "verified", true], ["intl.foreign-tax-credit", "outdated", false]], "outdated records are shown last and marked");
  assert.equal((await call("/api/challenge/review/knowledge", reviewer.token, { method: "POST", body: { ...base, body: "Edited wording of the note." } })).status, 200);
  assert.equal((await pg.query("SELECT status, reviewed_by FROM taxcomp.knowledge_records WHERE id = $1", [base.id])).rows[0].status, "draft", "an edit needs review again");
  const actions = (await pg.query("SELECT action FROM taxcomp.knowledge_record_events WHERE record_id = $1 ORDER BY occurred_at, action", [base.id])).rows.map((r) => r.action);
  assert.deepEqual(actions.sort(), ["created", "edited", "verified"]);
  const list = await call("/api/challenge/review/knowledge", reviewer.token);
  assert.ok(list.json.records.length > 40);
  assert.ok(list.json.options.licences.includes("restricted_no_text"));
  await pg.close();
});
