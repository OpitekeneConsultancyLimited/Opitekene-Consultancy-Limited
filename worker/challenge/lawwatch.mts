// Phase 7 (Master Development Directive): legislative update monitoring.
//
// Follows Parliament of Uganda's Bill Tracker (https://bills.parliament.ug/),
// the official public record of each Bill's stages. Once a day it lists the
// tax-related Bills, reads each one's stage page, and records what changed.
//
// It keeps proposed law and enacted law apart and never changes the law
// register: a Bill shown as "passed" is not law until it is assented and in
// force. The tracker does not record assent dates reliably (it shows
// 01/01/1970 for "not recorded"), so assent must be confirmed in the Uganda
// Gazette by a legal reviewer, who then updates the register by hand.
//
// Politeness: robots.txt is checked first (the tracker has none, which allows
// everything), requests identify TaxComp, are spaced out, and are capped.
import type { Database } from "./store.mts";

export const TRACKER_BASE = "https://bills.parliament.ug/";
export const LAW_WATCH_USER_AGENT = "TaxComp-LawWatch/1.0 (Opitekene Consultancy Limited; +https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/)";
// Kept well inside a free-plan Worker's limits (50 outside requests, little CPU):
// robots.txt + the home page + 25 Bill pages per run covers ~150 tax Bills in a week.
const MAX_BILLS_PER_RUN = 25;
const DELAY_MS = 1500;

export type BillStage = "first_reading" | "second_reading" | "passed" | "assented" | "withdrawn" | "unknown";

export const STAGE_LABEL: Readonly<Record<BillStage, string>> = Object.freeze({
  first_reading: "Introduced (first reading): proposed law only",
  second_reading: "Being debated (second reading): proposed law only",
  passed: "Passed by Parliament, awaiting assent: not yet law",
  assented: "Assented according to the tracker: confirm in the Gazette before treating it as law",
  withdrawn: "Withdrawn",
  unknown: "Stage not shown",
});

const STAGE_RANK: Record<BillStage, number> = { unknown: 0, first_reading: 1, second_reading: 2, passed: 3, assented: 4, withdrawn: 5 };

export interface TrackerBill { billId: number; title: string }

export interface BillDetails {
  billId: number;
  title: string;
  object: string;
  capReferences: string[];
  firstReading: string | null;
  secondReading: string | null;
  thirdReading: string | null;
  assentDate: string | null;
  withdrawnDate: string | null;
  stage: BillStage;
}

/** Bills about tax (the register's scope). Broad on purpose; a reviewer dismisses the rest. */
export function isTaxBill(title: string): boolean {
  return /\b(tax|taxes|taxation|duty|duties|excise|customs|revenue|levy|levies|stamp|finance|appropriation|lotteries|gaming|tariff|procedures code)\b/i.test(title);
}

function decode(text: string): string {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** The page as text: tags become " | " separators, whitespace collapsed. */
export function pageText(html: string): string {
  return decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " | "))
    .replace(/[ \t\r\n]+/g, " ").replace(/(\s*\|\s*)+/g, " | ").trim();
}

/** Every Bill linked from the tracker's home page, in page order, once each. */
export function parseTrackerIndex(html: string): TrackerBill[] {
  const bills = new Map<number, string>();
  for (const match of html.matchAll(/<a\b[^>]*href="[^"]*user_bill_stage\.php\?billid=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = Number(match[1]);
    const title = decode((match[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (Number.isSafeInteger(id) && id > 0 && title.length >= 6 && !bills.has(id)) bills.set(id, title.slice(0, 300));
  }
  return [...bills].map(([billId, title]) => ({ billId, title }));
}

/** dd/mm/yyyy -> yyyy-mm-dd; the tracker's 01/01/1970 means "not recorded". */
export function trackerDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  if (y === "1970" || Number(y) < 1990) return null;
  const iso = `${y}-${m}-${d}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function parseBillStage(billId: number, html: string): BillDetails {
  const text = pageText(html);
  const dateBefore = (label: string) => trackerDate(text.match(new RegExp(`(\\d{2}/\\d{2}/\\d{4})\\s*\\|\\s*${label}`, "i"))?.[1]);
  const title = text.match(/The [A-Z][^|]{3,200}? Bill,? \d{4}/)?.[0]?.trim() ?? "";
  const object = (text.match(/Object of the Bill\s*\|\s*([^|]{10,1200})/i)?.[1] ?? "").trim();
  const capReferences = [...new Set([...text.matchAll(/\bCap\.?\s*(\d{1,3})\b/gi)].map((m) => `Cap. ${m[1]}`))];
  const firstReading = dateBefore("First Reading");
  const secondReading = dateBefore("Second Reading");
  const thirdReading = dateBefore("Third Reading") ?? trackerDate(text.match(/Bill passed on\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const assentDate = dateBefore("Assented by President");
  const withdrawnDate = trackerDate(text.match(/Bill Withdrawn on\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const stage: BillStage = withdrawnDate ? "withdrawn" : assentDate ? "assented" : thirdReading ? "passed"
    : secondReading ? "second_reading" : firstReading ? "first_reading" : "unknown";
  return { billId, title, object, capReferences, firstReading, secondReading, thirdReading, assentDate, withdrawnDate, stage };
}

/** Minimal robots.txt check for the "*" group (prefix rules; Allow beats an equal-length Disallow). */
export function robotsAllows(robots: string, path: string): boolean {
  let applies = false;
  let best: { length: number; allow: boolean } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [field = "", ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();
    if (key === "user-agent") { applies = value === "*" || /taxcomp/i.test(value); continue; }
    if (!applies || (key !== "allow" && key !== "disallow") || !value) continue;
    const prefix = value.replace(/\*.*$/, "").replace(/\$$/, "");
    if (!path.startsWith(prefix)) continue;
    if (!best || prefix.length > best.length || (prefix.length === best.length && key === "allow")) best = { length: prefix.length, allow: key === "allow" };
  }
  return best ? best.allow : true;
}

export interface StoredBill {
  billId: number;
  stage: BillStage;
  title: string;
  firstReading: string | null;
  secondReading: string | null;
  thirdReading: string | null;
  assentDate: string | null;
}

export interface Change { kind: "new_bill" | "stage_change" | "dates_change"; fromStage: BillStage | null; toStage: BillStage; summary: string }

/** What changed since the last run, in words a reviewer can act on. */
export function compareBill(previous: StoredBill | null, current: BillDetails): Change | null {
  if (!previous) return { kind: "new_bill", fromStage: null, toStage: current.stage, summary: `New on the tracker: ${current.title}. ${STAGE_LABEL[current.stage]}.` };
  if (previous.stage !== current.stage) {
    const backwards = STAGE_RANK[current.stage] < STAGE_RANK[previous.stage] && current.stage !== "withdrawn";
    return { kind: "stage_change", fromStage: previous.stage, toStage: current.stage, summary: `${current.title}: ${STAGE_LABEL[previous.stage]} → ${STAGE_LABEL[current.stage]}.${backwards ? " The tracker now shows an earlier stage; check it." : ""}` };
  }
  const dates = (["firstReading", "secondReading", "thirdReading", "assentDate"] as const).filter((key) => previous[key] !== current[key]);
  if (dates.length) return { kind: "dates_change", fromStage: previous.stage, toStage: current.stage, summary: `${current.title}: stage dates changed (${dates.join(", ")}).` };
  return null;
}

/**
 * Which Bills to read this run (at most MAX_BILLS_PER_RUN): Bills never seen,
 * newest first; then the rest, least recently checked first. Settled Bills
 * (assented or withdrawn) are re-read only once a month, so every Bill is
 * covered over a few days without hammering the tracker.
 */
export function planQueue(bills: TrackerBill[], stored: Map<number, Record<string, unknown>>, now: Date, max = MAX_BILLS_PER_RUN): TrackerBill[] {
  const checkedAt = (bill: TrackerBill) => Date.parse(String(stored.get(bill.billId)?.lastCheckedAt ?? "1970-01-01T00:00:00Z"));
  const unseen = bills.filter((bill) => !stored.has(bill.billId)).sort((a, b) => b.billId - a.billId);
  const due = bills.filter((bill) => {
    const row = stored.get(bill.billId);
    if (!row) return false;
    const settled = row.stage === "withdrawn" || row.stage === "assented";
    return !settled || now.getTime() - checkedAt(bill) > 30 * 86_400_000;
  }).sort((a, b) => checkedAt(a) - checkedAt(b) || b.billId - a.billId);
  return [...unseen, ...due].slice(0, max);
}

export interface LawWatchEnv {
  /** Test seam: a function can only be injected by code, never by Worker vars. */
  LAW_WATCH_FETCH?: typeof fetch;
  LAW_WATCH_DELAY_MS?: number;
}

export interface RunResult { checked: number; taxBills: number; changes: number; skippedByRobots: boolean; errors: string[] }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runLawWatch(db: Database, env: LawWatchEnv, now: Date = new Date()): Promise<RunResult> {
  const fetchImpl = env.LAW_WATCH_FETCH ?? fetch;
  const delay = env.LAW_WATCH_DELAY_MS ?? DELAY_MS;
  const headers = { "User-Agent": LAW_WATCH_USER_AGENT, Accept: "text/html" };
  const result: RunResult = { checked: 0, taxBills: 0, changes: 0, skippedByRobots: false, errors: [] };
  const nowIso = now.toISOString();

  const robots = await fetchImpl(new URL("/robots.txt", TRACKER_BASE).toString(), { headers }).catch(() => null);
  const robotsText = robots && robots.ok ? await robots.text() : ""; // 404 or no file: no restrictions
  if (!robotsAllows(robotsText, "/") || !robotsAllows(robotsText, "/user_bill_stage.php")) {
    result.skippedByRobots = true;
    return result;
  }

  const index = await fetchImpl(TRACKER_BASE, { headers });
  if (!index.ok) throw new Error(`Bill Tracker home page returned ${index.status}.`);
  const taxBills = parseTrackerIndex(await index.text()).filter((bill) => isTaxBill(bill.title));
  result.taxBills = taxBills.length;

  const { results: storedRows } = await db.prepare(`SELECT bill_id AS "billId", stage, title, first_reading AS "firstReading", second_reading AS "secondReading",
    third_reading AS "thirdReading", assent_date AS "assentDate", last_checked_at AS "lastCheckedAt" FROM law_watch_bills`).all<Record<string, unknown>>();
  const stored = new Map(storedRows.map((row) => [Number(row.billId), row]));
  const queue = planQueue(taxBills, stored, now);

  for (const [index, bill] of queue.entries()) {
    if (index > 0 && delay > 0) await sleep(delay);
    const url = `${TRACKER_BASE}user_bill_stage.php?billid=${bill.billId}`;
    try {
      const response = await fetchImpl(url, { headers });
      if (!response.ok) { result.errors.push(`bill ${bill.billId}: HTTP ${response.status}`); continue; }
      const details = parseBillStage(bill.billId, await response.text());
      if (!details.title) details.title = bill.title;
      result.checked += 1;
      const row = stored.get(bill.billId);
      const previous: StoredBill | null = row ? {
        billId: bill.billId, stage: String(row.stage) as BillStage, title: String(row.title),
        firstReading: (row.firstReading as string | null) ?? null, secondReading: (row.secondReading as string | null) ?? null,
        thirdReading: (row.thirdReading as string | null) ?? null, assentDate: (row.assentDate as string | null) ?? null,
      } : null;
      const change = compareBill(previous, details);
      const statements = [
        db.prepare(`INSERT INTO law_watch_bills (bill_id, title, object, cap_references_json, stage, first_reading, second_reading, third_reading, assent_date, withdrawn_date,
            source_url, first_seen_at, last_checked_at, last_changed_at, review_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
          ON CONFLICT (bill_id) DO UPDATE SET title = EXCLUDED.title, object = EXCLUDED.object, cap_references_json = EXCLUDED.cap_references_json,
            stage = EXCLUDED.stage, first_reading = EXCLUDED.first_reading, second_reading = EXCLUDED.second_reading, third_reading = EXCLUDED.third_reading,
            assent_date = EXCLUDED.assent_date, withdrawn_date = EXCLUDED.withdrawn_date, last_checked_at = EXCLUDED.last_checked_at,
            last_changed_at = CASE WHEN ? = 1 THEN EXCLUDED.last_changed_at ELSE law_watch_bills.last_changed_at END,
            review_status = CASE WHEN ? = 1 THEN 'new' ELSE law_watch_bills.review_status END`)
          .bind(details.billId, details.title.slice(0, 300), details.object.slice(0, 2000), JSON.stringify(details.capReferences), details.stage,
            details.firstReading, details.secondReading, details.thirdReading, details.assentDate, details.withdrawnDate,
            url, nowIso, nowIso, nowIso, change ? 1 : 0, change ? 1 : 0),
      ];
      if (change) {
        result.changes += 1;
        statements.push(db.prepare(`INSERT INTO law_watch_events (id, bill_id, detected_at, kind, from_stage, to_stage, summary) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), details.billId, nowIso, change.kind, change.fromStage, change.toStage, change.summary.slice(0, 600)));
      }
      await db.batch(statements);
    } catch (error) {
      result.errors.push(`bill ${bill.billId}: ${error instanceof Error ? error.message.slice(0, 160) : "failed"}`);
    }
  }
  await db.prepare(`INSERT INTO law_watch_runs (id, ran_at, checked, tax_bills, changes, errors_json) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), nowIso, result.checked, result.taxBills, result.changes, JSON.stringify(result.errors.slice(0, 20))).run();
  return result;
}
