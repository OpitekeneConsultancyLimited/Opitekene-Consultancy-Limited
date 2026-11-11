// law-index.json: the structure of Uganda's tax Acts (structure only, no wording),
// the citation helper, and its use in the guided international answer.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lawIndex = require("./law-index.js");
const { detectFacts, analyse } = require("./intl-tax-reasoning.js");

const index = JSON.parse(fs.readFileSync(path.join(__dirname, "law-index.json"), "utf8"));
const migration = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261112000200_law_index.sql"), "utf8");
const sections = (act) => act.parts.flatMap((p) => p.divisions.flatMap((d) => d.items));

test("index: 18 instruments with chapters, ids and clean headings", () => {
  assert.equal(index.instruments.length, 18);
  assert.equal(index.status, "unverified");
  const ids = index.instruments.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  const caps = Object.fromEntries(index.instruments.filter((i) => i.kind === "act").map((i) => [i.id, i.cap]));
  assert.deepEqual(caps, { ita: "338", vata: "344", eacop: "156", cmaa: "335", eda: "336", sda: "339", tpca: "343", lga: "334", tata: "341", nssf: "230" });
  let total = 0;
  for (const act of index.instruments) {
    const list = sections(act);
    total += list.length;
    assert.equal(list.length, act.sectionCount, act.id);
    assert.equal(new Set(list.map((s) => s.section)).size, list.length, `${act.id}: section numbers are unique`);
    for (const item of list) {
      assert.match(item.section, /^\d{1,3}[A-Z]{0,2}$/, `${act.id} ${item.section}`);
      assert.ok(item.heading.length >= 3 && item.heading.length <= 120, `${act.id} ${item.section}: ${item.heading}`);
      assert.doesNotMatch(item.heading, /\(1\)|\bshall\b|\d{3,4}$|inserted by|substituted by|Act No\./i, `${act.id} ${item.section}: structure only, no wording or editorial notes`);
    }
    if (act.commencement) assert.match(act.commencement, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(total, 701);
  const ita = index.instruments.find((i) => i.id === "ita");
  assert.equal(ita.parts.find((p) => p.part === "IX").title, "International Taxation");
  assert.deepEqual(lawIndex.findSections(index, "ita", /^Foreign tax credit$/).map((s) => [s.section, s.part]), [["80", "IX"]]);
});

test("migration: one draft record per instrument, register gaps filled, compendium kept as metadata only", () => {
  for (const act of index.instruments) assert.ok(migration.includes(`'ug.law.${act.id}'`), act.id);
  for (const id of ["sda", "lga", "cmaa", "eacop", "nssf"]) assert.match(migration, new RegExp(`\\('${id}', '[^']+', 'Cap\\. \\d+', 'principal'`));
  assert.match(migration, /SET chapter = 'Cap\. 341'/);
  assert.match(migration, /'compendium-tax-laws-2024-25'[\s\S]*?'metadata_only', 'restricted_no_text'/);
  assert.doesNotMatch(migration, /'original_note'|'official_text'|'licensed_excerpt'/, "no text from the compendium is stored");
});

test("citations: sections by number and heading, grouped by Act", () => {
  const cited = lawIndex.cite(index, [["ita", /^Foreign tax credit$/], ["ita", /^International agreements$/], ["vata", /^Place of supply of services$/], ["nope", /x/]]);
  assert.equal(cited, "Income Tax Act (Cap. 338): s.80 Foreign tax credit; s.88 International agreements · Value Added Tax Act (Cap. 344): s.16 Place of supply of services");
  assert.equal(lawIndex.cite(null, [["ita", /x/]]), "");
  assert.match(lawIndex.cite(index, [["ita-reg-transfer-pricing-2011", /^Documentation$/]]), /reg\. 8 Documentation/);
});

test("guided answers cite the sections when the index is loaded", () => {
  const consultant = { ...detectFacts("I am a consultant in Kampala; a client in the UK paid me fees and tax was withheld there in 2025/26."), regularity: "regular" };
  const text = JSON.stringify(analyse(consultant, [], index));
  for (const s of ["s.9 Resident individual", "s.78 Source of income", "s.80 Foreign tax credit", "s.88 International agreements", "s.118 Furnishing of return of income", "s.121 Payment of provisional tax"]) assert.ok(text.includes(s), s);
  assert.match(text, /have not yet been checked against the official edition/);

  const accountant = { ...detectFacts("Our client, a Ugandan company, pays management fees to its parent company in Kenya in 2026/27."), presence: "no" };
  const outbound = JSON.stringify(analyse(accountant, [], index));
  for (const s of ["s.82 Tax on international payments", "s.84 Tax on payments to non-resident contractors or professionals", "s.16 Place of supply of services", "s.116 Transactions between associates", "reg. 8 Documentation"]) assert.ok(outbound.includes(s), s);
  assert.doesNotMatch(outbound, /\d\s?%/, "still no rates");

  const withoutIndex = JSON.stringify(analyse(consultant));
  assert.ok(!withoutIndex.includes("s.80"), "without the index the answer names the Act only");
});

test("2026 amendments: grouped by amending Act, with both figures shown when they differ", () => {
  const data = {
    acts: [{ id: "vata-amendment-2026", title: "Value Added Tax (Amendment) Act, 2026" }, { id: "eda-amendment-2026", title: "Excise Duty (Amendment) Act, 2026" }, { id: "unused", title: "No changes" }],
    amendments: [
      { amendingStatuteId: "eda-amendment-2026", amendingTitle: "Excise Duty (Amendment) Act, 2026", id: "eda-2026-cement", previousFigure: "UGX 500 per 50 kg", billFigure: "UGX 1,000 per 50 kg", reportedFigure: "UGX 750 per 50 kg", figuresDiffer: true },
      { amendingStatuteId: "vata-amendment-2026", amendingTitle: "Value Added Tax (Amendment) Act, 2026", id: "vat-2026-s5", previousFigure: null, billFigure: null, reportedFigure: null, figuresDiffer: false },
      { amendingStatuteId: "other-2026", amendingTitle: "Other (Amendment) Act, 2026", id: "x", previousFigure: null, billFigure: "1", reportedFigure: null, figuresDiffer: false },
    ],
  };
  const groups = lawIndex.groupAmendments(data);
  assert.deepEqual(groups.map((g) => g.act.id), ["vata-amendment-2026", "eda-amendment-2026", "other-2026"], "register order; Acts without changes dropped; unknown Acts kept");
  assert.deepEqual(lawIndex.figureLines(data.amendments[0]), [["Before", "UGX 500 per 50 kg"], ["Published Bill", "UGX 1,000 per 50 kg"], ["Reported as enacted", "UGX 750 per 50 kg"]]);
  assert.deepEqual(lawIndex.figureLines(data.amendments[1]), []);
  assert.deepEqual(lawIndex.groupAmendments(null), []);
});