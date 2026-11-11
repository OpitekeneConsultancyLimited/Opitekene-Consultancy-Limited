const test = require("node:test");
const assert = require("node:assert/strict");
const { rankBlocks, snippet, words } = require("./kb-search.js");

const blocks = [
  { text: "Rental income tax for individuals", heading: true, kb: "guides", section: "Tax guides" },
  { text: "Landlords pay tax on rental income above the threshold set in the Income Tax Act.", heading: false, kb: "guides", section: "Tax guides" },
  { text: "Rental income tax for individuals", heading: true, kb: "laws", section: "Duplicate heading" },
  { text: "VAT registration threshold", heading: true, kb: "compliance", section: "Compliance" },
  { text: "Value Added Tax (Amendment) Act, 2026", heading: false, kb: "laws", section: "Law register" },
];

test("knowledge search: every word must match; headings first; duplicates once", () => {
  const hits = rankBlocks(blocks, "rental income");
  assert.deepEqual(hits.map((h) => h.section), ["Tax guides", "Tax guides"]);
  assert.equal(hits[0].heading, true, "the heading ranks first");
  assert.deepEqual(rankBlocks(blocks, "rental vat"), [], "all words are required");
  assert.deepEqual(rankBlocks(blocks, " "), []);
  assert.equal(rankBlocks(blocks, "AMENDMENT 2026")[0].kb, "laws", "case-insensitive, numbers count");
  assert.deepEqual(rankBlocks(blocks, "a"), [], "single letters are ignored");
  assert.deepEqual(words("Rental, income!"), ["rental", "income"]);
});

test("snippets mark the matched words and trim long text", () => {
  const parts = snippet("Landlords pay tax on rental income above the threshold.", "rental");
  assert.deepEqual(parts.filter((p) => p.mark).map((p) => p.text), ["rental"]);
  const long = snippet(`${"x ".repeat(200)}needle ${"y ".repeat(200)}`, "needle");
  const joined = long.map((p) => p.text).join("");
  assert.ok(joined.startsWith("…") && joined.endsWith("…") && joined.includes("needle"));
});
