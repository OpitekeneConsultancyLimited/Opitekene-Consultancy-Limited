// Builds law-index.json: the structure of Uganda's tax Acts and regulations
// (title, chapter, commencement, Parts, section numbers and headings), read
// from the "Arrangement of Sections" printed at the start of each Act in a
// compendium PDF.
//
// Only statutory structure is kept. Statutes carry no copyright in Uganda,
// but a compiler's selection, footnotes and tracked-amendment notes do, so
// none of those are taken, and no section wording is extracted.
//
//   npm i --no-save pdfjs-dist@4.10.38
//   node scripts/compendium-index.mjs "<compendium.pdf>" law-index.json
import { readFile, writeFile } from "node:fs/promises";

const [pdfPath, outPath = "law-index.json"] = process.argv.slice(2);
if (!pdfPath) {
  console.error('Usage: node scripts/compendium-index.mjs "<compendium.pdf>" [law-index.json]');
  process.exit(2);
}

let pdfjs;
try {
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
} catch {
  console.error("Install pdfjs first: npm i --no-save pdfjs-dist@4.10.38");
  process.exit(2);
}

/** Text lines of every page, joining fragments by their position (the PDF splits words). */
export async function readLines(data) {
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x: it.transform[4], w: it.width, s: it.str, size: Math.abs(it.transform[0]) || 10 });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null;
      for (const part of r.parts) {
        if (end !== null && part.x - end > part.size * 0.2 && !text.endsWith(" ") && !part.s.startsWith(" ")) text += " ";
        text += part.s;
        end = part.x + part.w;
      }
      return text.replace(/\s+/g, " ").trim();
    }).filter(Boolean));
  }
  return pages;
}

const ITEM = /^(\d{1,3}[A-Z]{0,2})\s*\.\s*(\S.*)$/;
const PART = /^PART\s+([IVXLC]+|1{1,3})\s*[–—-]+\s*(.+)$/i;
const ONES = { 1: "I", 11: "II", 111: "III" };
const SCHEDULE = /^(?:(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\s+Schedule|Schedules?)\b/i;
const NOISE = /^(?:Section|Sections|Regulation|Regulations|Rule|Rules|Paragraph|(?:st|nd|rd|th)(?: \d{1,4})?|\d{1,4}|Details intentionally left out)\.?$/i;
const SMALL_WORDS = new Set(["and", "of", "the", "in", "on", "for", "to", "or", "a", "an", "under", "by", "with", "from", "at", "into"]);
const PROSE = /^(?:These|This|In|All|The|A|An|Where|If|Subject|Any|Every|No|Nothing|For)\s+[a-z]/;

function clean(text) {
  return text
    .replace(/\s+([,.;:)’])/g, "$1")
    .replace(/([(‘])\s+/g, "$1")
    .replace(/\s*-\s*(?=[a-z])/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A section heading: footnote markers and any wording after the heading are dropped. */
function heading(text) {
  let h = clean(text).replace(/(?<![,\d])\s+\d{3,4}$/, "");
  if (h.length > 100) h = h.split(/\.\s+(?=[(A-Z“"])/)[0];
  return h.replace(/\.$/, "").trim();
}

function titleCase(text) {
  return clean(text).toLowerCase()
    .replace(/[a-z][a-z’']*/g, (word, offset) => (offset > 0 && SMALL_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .replace(/\bVat\b/g, "VAT").replace(/\bEacop\b/g, "EACOP").replace(/\bE-(\w)/g, (_, c) => `E-${c.toUpperCase()}`)
    .replace(/’S\b/g, "’s").replace(/'S\b/g, "'s");
}

/** The instrument's own heading block above "Arrangement of": title, chapter, commencement, enabling provision. */
function describe(pageLines, index) {
  const above = pageLines.slice(1, index); // line 0 is the compendium's running header
  const header = pageLines[0] ?? "";
  const cap = header.match(/\bCap\.?\s?(\d{2,3})\b/)?.[1] ?? null;
  // The title is the last block of capitals above "Arrangement of" (a page can
  // end one instrument and start the next).
  const title = [];
  let start = above.length;
  for (let k = above.length - 1; k >= 0; k--) {
    const line = above[k];
    const isTitle = /^[(A-Z][A-Z0-9 ,()'’&/–—.-]{3,}$/.test(line) && !/^(?:STATUTORY INSTRUMENTS?|PART)\b/.test(line);
    if (isTitle) { title.unshift(line); start = k; continue; }
    if (title.length) break;
  }
  const own = above.slice(Math.max(0, start - 2)); // the title, the line or two above it (SI number) and everything below
  const blob = own.join(" ").replace(/\s+/g, " ");
  const commencement = isoDate(blob.match(/Commencement\s*:\s*(.+?\d{4})/i)?.[1]);
  const enabling = blob.match(/\(Under (.+?Act)\.?\)?(?:\s|$)/i)?.[1] ?? null;
  const si = [...blob.matchAll(/(?:Statutory Instruments?|SI)\s*(?:No\.?\s*)?(\d+\s*of\s*\d{4}|\d{4}\s*No\.?\s*\d+|\d{3}\s*[—–-]\s*\d+)/gi)].pop()?.[1] ?? null;
  const name = title.join(" ").replace(/^THE\s+/, "").replace(/\.$/, "");
  return { title: titleCase(name).replace(/\bE-\s+/g, "E-"), cap, commencement, enablingProvision: enabling ? `Under ${clean(enabling)}` : null, statutoryInstrument: si ? clean(si) : null };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "1st July, 2014" -> "2014-07-01"; null when the date is not clear. */
function isoDate(text) {
  const m = String(text ?? "").replace(/(\d)\s*(?:st|nd|rd|th)\b/g, "$1").match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function buildIndex(pages) {
  const instruments = [];
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p];
    const at = lines.findIndex((l) => /^Arrangement of (Sections|Regulations|Rules|Paragraphs)\.?$/i.test(l));
    if (at < 0) continue;
    const meta = describe(lines, at);
    const runningHeader = lines[0];
    const parts = [];
    let part = { part: null, title: null, divisions: [] };
    let division = { title: null, items: [] };
    const schedules = [];
    let last = null;
    let seen = 0;
    let bodyMode = false; // no printed arrangement: read headings from the body itself
    let done = false;
    const flushDivision = () => { if (division.items.length) part.divisions.push(division); };
    const flushPart = () => { flushDivision(); if (part.divisions.length) parts.push(part); };

    for (let q = p; q < pages.length && !done; q++) {
      if (q > p && pages[q][0] !== runningHeader) break; // the next instrument
      const body = q === p ? lines.slice(at + 1) : pages[q].slice(1);
      for (const raw of body) {
        const line = raw.trim();
        if (!line || NOISE.test(line)) continue;
        if (/^(?:={5,}|History:|Statutory Instrument|STATUTORY INSTRUMENTS?\b|SUBSIDIARY LEGISLATION)/i.test(line)) { if (seen) { done = true; break; } continue; }
        if (/^(?:An Act|BE IT ENACTED|IN EXERCISE|Arrangement of)/i.test(line) || /^Act, these|made this/i.test(line)) { if (seen && !bodyMode) { done = true; break; } continue; }
        const item = line.match(ITEM);
        if (item && !/^\d+\.\s*\d/.test(line)) {
          const number = item[1];
          if (seen && !bodyMode && number === "1") { done = true; break; } // the body restarts at section 1
          if (schedules.length && !bodyMode) { done = true; break; } // a numbered list after the Schedules
          // A bracketed number such as "(94) Appeal from ..." is the compiler's editorial mark
          // (it repeats a real section number), so it is dropped.
          last = { section: number, heading: heading(item[2].replace(/\s*\(\d{1,3}[A-Z]?\)\s*[A-Z].*$/, "")) };
          division.items.push(last);
          seen++;
          continue;
        }
        const partMatch = line.match(PART);
        if (partMatch) {
          const numeral = ONES[partMatch[1]] ?? partMatch[1].toUpperCase();
          if (seen && [...parts, part].some((x) => x.part === numeral)) { done = true; break; }
          flushPart();
          part = { part: numeral, title: titleCase(partMatch[2]), divisions: [] };
          division = { title: null, items: [] };
          last = null;
          continue;
        }
        if (SCHEDULE.test(line) && seen) {
          if (line.length < 140 && !bodyMode) schedules.push(clean(line.replace(/\s+\d{3,4}$/, "")));
          last = null;
          continue;
        }
        if (bodyMode) continue; // in the body only headings are read
        if (seen && last && /^[A-Z][A-Z ,'’()&-]+$/.test(line) && !division.items.length && !part.divisions.length) {
          part.title = titleCase(`${part.title} ${line}`); // a Part title running onto a second line
          continue;
        }
        if (!seen && part.part && /^[A-Z][A-Z ,'’()&-]+$/.test(line)) { part.title = titleCase(`${part.title} ${line}`); continue; }
        if (seen && part.part && !division.items.length && !part.divisions.length && /^[A-Z][A-Z ,'’()&-]+$/.test(line)) { part.title = titleCase(`${part.title} ${line}`); continue; }
        const wrapped = line.match(/^\((\d{1,3}[A-Z]?)\)\s*([A-Z].*)$/);
        if (wrapped && seen) { last = null; continue; } // editorial bracketed entry: dropped
        if (last && (/^[a-z(]/.test(line) || SMALL_WORDS.has(last.heading.split(" ").pop().toLowerCase()))) {
          last.heading = heading(`${last.heading} ${line}`);
          continue;
        }
        if (seen <= 3 && (line.length > 60 || PROSE.test(line))) { bodyMode = true; continue; } // wording follows the heading: no printed arrangement
        if (seen && /^[A-Z][A-Za-z ,'’()&-]{3,80}$/.test(line) && !/[.;:]$/.test(line)) {
          flushDivision();
          division = { title: /^[A-Z ,'’()&-]+$/.test(line) ? titleCase(line) : clean(line), items: [] };
          last = null;
          continue;
        }
        if (seen > 3 && line.length > 90) { done = true; break; } // running text: the body has started
      }
    }
    flushPart();
    const count = parts.reduce((n, x) => n + x.divisions.reduce((m, d) => m + d.items.length, 0), 0);
    if (count) instruments.push({ ...meta, kind: /Sections/i.test(lines[at]) ? "act" : "regulations", source: bodyMode ? "headings in the text" : "arrangement of sections", pdfPage: p + 1, sectionCount: count, parts, schedules: [...new Set(schedules)].filter((s) => !/^SCHEDULES?$/i.test(s)) });
  }
  return instruments;
}

// Stable ids. Acts use the law register's statute ids; tax categories match worker/challenge/knowledge.mts.
const IDS = [
  [/^Income Tax Act$/, "ita", "income-tax"],
  [/^Income Tax \(Tax Incentives for Exporters/, "ita-reg-exporters-2009", "income-tax"],
  [/^Income Tax \(Transfer Pricing\)/, "ita-reg-transfer-pricing-2011", "transfer-pricing"],
  [/^Value Added Tax Act$/, "vata", "vat"],
  [/^Value Added Tax \(Deferment/, "vat-reg-deferment-2013", "vat"],
  [/^East African Crude Oil Pipeline/, "eacop", "petroleum"],
  [/^Convention on Mutual Administrative Assistance/, "cmaa", "exchange-of-information"],
  [/^Excise Duty Act$/, "eda", "excise-duty"],
  [/^Stamp Duty Act$/, "sda", "stamp-duty"],
  [/^Tax Procedures Code Act$/, "tpca", "tax-administration"],
  [/^Tax Procedures Code \(E-Invoicing/, "tpc-reg-einvoicing-2020", "tax-administration"],
  [/^Tax Procedures Code \(Alternative Dispute/, "tpc-reg-adr-2023", "objections-appeals"],
  [/^Lotteries and Gaming Act$/, "lga", "gaming-and-betting"],
  [/^Tax Appeals Tribunals Act$/, "tata", "objections-appeals"],
  [/^National Social Security Fund Act$/, "nssf", "social-security"],
  [/^National Social Security Fund \(Registration and Records\)/, "nssf-reg-registration-records", "social-security"],
  [/^National Social Security Fund \(Contributions\)/, "nssf-reg-contributions", "social-security"],
  [/^National Social Security Fund \(Voluntary/, "nssf-reg-voluntary", "social-security"],
];

const pages = await readLines(new Uint8Array(await readFile(pdfPath)));
const instruments = buildIndex(pages).map(({ pdfPage, ...instrument }) => {
  const rule = IDS.find(([pattern]) => pattern.test(instrument.title));
  if (!rule) throw new Error(`No id for "${instrument.title}" (page ${pdfPage}): add it to IDS.`);
  return { id: rule[1], taxCategory: rule[2], ...instrument };
});
const index = {
  edition: "Laws of Uganda, Revised Edition 2024, as in force for FY 2024/25",
  extractedFrom: "The Arrangement of Sections printed at the start of each Act and regulation in a FY 2024/25 compendium of Uganda tax laws. Only statutory structure was taken: titles, chapters, commencement dates, Parts, section numbers and headings. No section wording, footnotes or editorial notes.",
  caveats: [
    "Amendments made after FY 2024/25 (including the 2025 and 2026 amendment Acts) are not reflected.",
    "Section numbers are as printed. A few sections inserted by amendment Acts carry pre-revision numbers (for example Income Tax Act 118I and Tax Procedures Code Act 40E).",
    "Not yet checked against the Uganda Law Reform Commission's official edition.",
  ],
  status: "unverified",
  instruments,
};
await writeFile(outPath, `${JSON.stringify(index, null, 1)}\n`);
for (const i of instruments) console.log(`${i.id.padEnd(30)} ${i.kind.padEnd(11)} ${i.cap ?? "   "} ${String(i.sectionCount).padStart(4)}  ${i.title}`);