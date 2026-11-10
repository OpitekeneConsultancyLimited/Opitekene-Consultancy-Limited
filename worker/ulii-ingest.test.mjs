// TAT ingestion: robots.txt compliance and the reviewer CSV import.
import test from "node:test";
import assert from "node:assert/strict";
import { importCsv, isAllowed, parseRobots, USER_AGENT } from "../scripts/ulii-ingest.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

// Excerpt of https://ulii.org/robots.txt as read on 2026-11-10.
const ULII_ROBOTS = `User-agent: *
Content-Signal: ai-train=no, search=yes, ai-input=no
Allow: /

Disallow: /api/
Disallow: /judgments/
Crawl-delay: 5
Sitemap: https://ulii.org/sitemap.xml

Disallow: /search/
Disallow: /en/search/
Disallow: /akn/*/provision/*
Disallow: /en/akn/*/provision/*
Disallow: /akn/ug/judgment/
`;

test("robots.txt: judgment pages are blocked, crawl delay is honoured, client is identified", () => {
  const robots = parseRobots(ULII_ROBOTS);
  assert.equal(robots.crawlDelay, 5);
  assert.equal(isAllowed(robots, "/judgments/UGTAT/"), false);
  assert.equal(isAllowed(robots, "/akn/ug/judgment/ugtat/2023/2/eng@2023-02-21"), false);
  assert.equal(isAllowed(robots, "/en/akn/ug/act/1997/11/provision/s22"), false);
  assert.equal(isAllowed(robots, "/en/akn/ug/act/1997/11/eng@2024-12-23"), true);
  assert.equal(isAllowed(robots, "/sitemap.xml"), true);
  assert.match(USER_AGENT, /^TaxCompCaseIngest\/1\.0 \(\+https:\/\//);
});

test("CSV import validates rows and produces SQL that loads with drafts unreviewed and appeal status unverified", async () => {
  const csv = `id,citation,parties,decision_date,source_url,issue_tags,search_terms,legal_question,decision,summary_source
case-one,TAT 1 of 2020,A v URA,2021-01-05,https://ulii.org/x/1,expense-deductibility;burden-of-proof,expenses evidence,Q?,"D, with comma",staff
case-two,TAT 2 of 2020,B v URA,,https://ulii.org/x/2,interest,,,,
`;
  const out = importCsv(csv, "2026-11-10T00:00:00.000Z");
  const { pg } = await createMigratedDatabase();
  await pg.exec(out);
  const rows = (await pg.query("SELECT id, summary_status, summary_source, appeal_status, issue_tags_json FROM taxcomp.tax_case_law WHERE id LIKE 'case-%' ORDER BY id")).rows;
  assert.deepEqual(rows, [
    { id: "case-one", summary_status: "draft", summary_source: "staff", appeal_status: "unverified", issue_tags_json: '["expense-deductibility","burden-of-proof"]' },
    { id: "case-two", summary_status: "none", summary_source: null, appeal_status: "unverified", issue_tags_json: '["interest"]' },
  ]);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM taxcomp.tax_case_law WHERE id = 'quickway-property-services-ura-2023'")).rows[0].n, 1, "seed migration loaded");
  await pg.close();
  assert.throws(() => importCsv(csv.replace("https://ulii.org/x/1", "http://example.com/x")), /ulii\.org/);
  assert.throws(() => importCsv(csv.replace("expense-deductibility;burden-of-proof", "made-up-tag")), /issue_tags/);
});
