#!/usr/bin/env node
// TAT case repository ingestion (brief Section 8.2).
//
// ULII's robots.txt (checked 2026-11-10) DISALLOWS /judgments/ and
// /akn/ug/judgment/ for every crawler, sets Crawl-delay: 5 and
// Content-Signal ai-input=no, and its pages answer automated clients with a
// Cloudflare challenge. So this script never fetches judgment pages and never
// feeds ULII content to an AI model. It has two modes:
//
//   node scripts/ulii-ingest.mjs check <url> [...]
//       Reports, for each URL, whether robots.txt allows it. Allowed URLs are
//       fetched one at a time (at most one request per max(Crawl-delay, 1) s)
//       with an identifying User-Agent; a challenge page stops the run. Nothing
//       is ever retried to get round a block.
//
//   node scripts/ulii-ingest.mjs import <cases.csv> [out.sql]
//       Turns a reviewer-curated CSV of TAT decisions (metadata and links, read
//       by a person on ULII) into an idempotent SQL migration for
//       taxcomp.tax_case_law. Columns:
//         id,citation,parties,decision_date,source_url,issue_tags,search_terms,
//         legal_question,decision,summary_source
//       issue_tags are ";"-separated ids from worker/challenge/search.mts.
//       Rows with a summary are stored as summary_status 'draft' until a
//       reviewer approves them; appeal_status is always 'unverified'.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ISSUE_TAGS } from "../worker/challenge/search.mts";

export const USER_AGENT = "TaxCompCaseIngest/1.0 (+https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/; contact via the site's Contact Us)";

/** Minimal robots.txt parser for the "*" group: Disallow/Allow prefixes with "*" wildcards, Crawl-delay. */
export function parseRobots(text) {
  const rules = [];
  let crawlDelay = 0;
  let applies = false;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const field = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") applies = value === "*";
    else if (!applies) continue;
    else if (field === "disallow" && value) rules.push({ allow: false, pattern: value });
    else if (field === "allow" && value) rules.push({ allow: true, pattern: value });
    else if (field === "crawl-delay") crawlDelay = Math.max(crawlDelay, Number(value) || 0);
  }
  // Rules after "User-agent: *" that appear after a blank group still belong to it on ULII.
  return { rules, crawlDelay };
}

function toRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped.endsWith("\\$") ? escaped.slice(0, -2) + "$" : escaped}`);
}

/** Longest matching rule wins; ties go to Allow (Google's interpretation). */
export function isAllowed(robots, path) {
  let best = null;
  for (const rule of robots.rules) {
    if (!toRegex(rule.pattern).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

const sql = (value) => (value === null || value === undefined || value === "" ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

export function importCsv(text, ingestedAt = new Date().toISOString()) {
  const [header, ...rows] = csvRows(text.replace(/^﻿/, ""));
  const columns = header.map((h) => h.trim());
  const required = ["id", "citation", "parties", "decision_date", "source_url", "issue_tags"];
  for (const column of required) if (!columns.includes(column)) throw new Error(`CSV is missing the "${column}" column.`);
  const known = new Set(ISSUE_TAGS.map((tag) => tag.id));
  const values = rows.map((cells, index) => {
    const row = Object.fromEntries(columns.map((column, i) => [column, (cells[i] ?? "").trim()]));
    const where = `row ${index + 2} (${row.id || "no id"})`;
    if (!/^[a-z0-9-]{3,120}$/.test(row.id)) throw new Error(`${where}: id must be lowercase letters, digits and hyphens.`);
    if (!/^https:\/\/ulii\.org\//.test(row.source_url)) throw new Error(`${where}: source_url must be a https://ulii.org/ link.`);
    if (row.decision_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.decision_date)) throw new Error(`${where}: decision_date must be YYYY-MM-DD.`);
    const tags = row.issue_tags.split(";").map((tag) => tag.trim()).filter(Boolean);
    const unknown = tags.filter((tag) => !known.has(tag));
    if (!tags.length || unknown.length) throw new Error(`${where}: issue_tags must be one or more of ${[...known].join(", ")}.`);
    const hasSummary = Boolean(row.legal_question || row.decision);
    const source = hasSummary ? (row.summary_source === "ai" ? "ai" : "staff") : null;
    return `(${[sql(row.id), sql(row.citation), sql(row.parties), sql(row.decision_date), "'TAT'", sql(row.legal_question), sql(row.decision),
      `'${hasSummary ? "draft" : "none"}'`, sql(source), sql(JSON.stringify(tags)), `'${String(row.search_terms ?? "").replace(/'/g, "''")}'`, sql(row.source_url), "'unverified'", sql(ingestedAt)].join(", ")})`;
  });
  if (!values.length) throw new Error("The CSV has no cases.");
  return [
    "-- Generated by scripts/ulii-ingest.mjs import. Metadata and links curated by a person from ULII;",
    "-- summaries stay 'draft' until a reviewer approves them; appeal_status is never inferred.",
    "SET search_path TO taxcomp;",
    "INSERT INTO tax_case_law (id, citation, parties, decision_date, forum, legal_question, decision, summary_status, summary_source, issue_tags_json, search_terms, source_url, appeal_status, ingested_at) VALUES",
    `  ${values.join(",\n  ")}`,
    "ON CONFLICT (id) DO NOTHING;",
    "",
  ].join("\n");
}

async function check(urls) {
  const robotsUrl = "https://ulii.org/robots.txt";
  const robotsResponse = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!robotsResponse.ok) throw new Error(`Could not read ${robotsUrl} (${robotsResponse.status}); not fetching anything.`);
  const robots = parseRobots(await robotsResponse.text());
  const delayMs = Math.max(1, robots.crawlDelay) * 1000;
  for (const url of urls) {
    const target = new URL(url);
    if (target.origin !== "https://ulii.org") { console.log(`SKIP ${url}: not ULII.`); continue; }
    if (!isAllowed(robots, target.pathname)) { console.log(`BLOCKED by robots.txt: ${target.pathname}`); continue; }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const body = await response.text();
    if (response.status === 403 || /<title>\s*Just a moment/i.test(body)) {
      console.log(`STOPPED: ${url} answered with a bot challenge (${response.status}). Not retrying.`);
      return;
    }
    console.log(`OK ${response.status} ${url}`);
  }
}

const [mode, ...args] = process.argv.slice(2);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (mode === "check" && args.length) await check(args);
  else if (mode === "import" && args[0]) {
    const out = importCsv(readFileSync(args[0], "utf8"));
    if (args[1]) { writeFileSync(args[1], out); console.log(`Wrote ${args[1]}`); } else process.stdout.write(out);
  } else if (mode) {
    console.error("Usage: node scripts/ulii-ingest.mjs check <url>... | import <cases.csv> [out.sql]");
    process.exitCode = 2;
  }
}
