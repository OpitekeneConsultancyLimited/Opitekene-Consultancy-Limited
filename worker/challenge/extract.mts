// F1 Assessment reader: output validation (for every provider) and a
// deterministic text reader used when no AI provider is available. Pure.
import { isIsoDate } from "./dates.mts";
import { TAX_HEADS, type ConfirmableField } from "./types.mts";

export interface ExtractedField {
  fieldName: ConfirmableField;
  value: string | null; // stored as text; numbers as integer strings, lists as JSON
  confidence: number;
}

export type ExtractionSource = "ai-claude" | "ai-gemini" | "text-reader";

export interface Extraction {
  source: ExtractionSource;
  fields: ExtractedField[];
  warnings: string[];
}

export class MalformedExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExtractionError";
  }
}

const TEXT_FIELDS = ["tin", "period_start", "period_end", "date_issued", "ura_reasons"] as const;
const NUMBER_FIELDS = ["principal", "penal_tax", "interest", "interest_rate_percent_per_month", "interest_months", "penal_tax_percent"] as const;
export const EXTRACTION_FIELDS: ConfirmableField[] = [
  "tin", "tax_head", "assessment_type", "period_start", "period_end", "date_issued",
  "principal", "penal_tax", "interest", "interest_rate_percent_per_month", "interest_months", "penal_tax_percent",
  "ura_reasons", "provisions_cited",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slot(raw: Record<string, unknown>, key: string): { value: unknown; confidence: number } {
  const entry = raw[key];
  if (!isRecord(entry) || !("value" in entry) || typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence)) {
    throw new MalformedExtractionError(`Field "${key}" is missing or malformed.`);
  }
  return { value: entry.value, confidence: Math.min(1, Math.max(0, entry.confidence)) };
}

/**
 * Validates provider output against the schema in prompts/assessment-extraction.v2.json.
 * Structural problems throw (the whole result is discarded). A single value
 * that is present but implausible is dropped to null with confidence 0.
 */
export function validateExtraction(raw: unknown, source: ExtractionSource): Extraction {
  if (!isRecord(raw)) throw new MalformedExtractionError("The reader did not return an object.");
  const fields: ExtractedField[] = [];
  const warnings: string[] = [];
  const drop = (fieldName: ConfirmableField, why: string) => {
    fields.push({ fieldName, value: null, confidence: 0 });
    warnings.push(`${fieldName.replace(/_/g, " ")}: ${why}`);
  };

  for (const key of TEXT_FIELDS) {
    const { value, confidence } = slot(raw, key);
    if (value === null) { fields.push({ fieldName: key, value: null, confidence: 0 }); continue; }
    if (typeof value !== "string") throw new MalformedExtractionError(`Field "${key}" must be text or null.`);
    const text = value.trim().slice(0, key === "ura_reasons" ? 4000 : 40);
    if (key === "tin" && !/^\d{10}$/.test(text.replace(/\s/g, ""))) { drop(key, "not a 10-digit TIN"); continue; }
    if (key !== "tin" && key !== "ura_reasons" && !isIsoDate(text)) { drop(key, "not a valid date"); continue; }
    fields.push({ fieldName: key, value: key === "tin" ? text.replace(/\s/g, "") : text, confidence });
  }
  for (const key of NUMBER_FIELDS) {
    const { value, confidence } = slot(raw, key);
    if (value === null) { fields.push({ fieldName: key, value: null, confidence: 0 }); continue; }
    if (typeof value !== "number" || !Number.isFinite(value)) throw new MalformedExtractionError(`Field "${key}" must be a number or null.`);
    if (value < 0 || value > 1e13) { drop(key, "outside a plausible range"); continue; }
    if ((key === "interest_rate_percent_per_month" || key === "penal_tax_percent") && value > 100) { drop(key, "not a plausible percentage"); continue; }
    const stored = key.endsWith("percent_per_month") || key === "penal_tax_percent" ? String(value) : String(Math.round(value));
    fields.push({ fieldName: key, value: stored, confidence });
  }
  {
    const { value, confidence } = slot(raw, "tax_head");
    if (value !== null && !(TAX_HEADS as readonly unknown[]).includes(value)) throw new MalformedExtractionError('Field "tax_head" has an unknown value.');
    fields.push({ fieldName: "tax_head", value: value as string | null, confidence: value === null ? 0 : confidence });
  }
  {
    const { value, confidence } = slot(raw, "assessment_type");
    if (value !== null && value !== "original" && value !== "additional" && value !== "other") throw new MalformedExtractionError('Field "assessment_type" has an unknown value.');
    fields.push({ fieldName: "assessment_type", value: value as string | null, confidence: value === null ? 0 : confidence });
  }
  {
    const { value, confidence } = slot(raw, "provisions_cited");
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new MalformedExtractionError('Field "provisions_cited" must be a list of text.');
    const list = (value as string[]).map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 30);
    fields.push({ fieldName: "provisions_cited", value: JSON.stringify(list), confidence: list.length ? confidence : 0 });
  }

  const get = (name: ConfirmableField) => fields.find((field) => field.fieldName === name)?.value ?? null;
  const start = get("period_start");
  const end = get("period_end");
  if (start && end && start > end) warnings.push("The period start is after the period end; please check both.");
  return { source, fields, warnings };
}

// ------------------------------------------------------------ text reader
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4})`;
const AMOUNT = String.raw`(?:UGX|Ushs?\.?|Shs?\.?)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)`;

export function parseNoticeDate(raw: string): string | null {
  const text = raw.trim();
  const build = (d: number, m: number, y: number) => {
    const value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isIsoDate(value) ? value : null;
  };
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return build(Number(match[3]), Number(match[2]), Number(match[1]));
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) return build(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[(match[2] ?? "").slice(0, 3).toLowerCase()];
    return month ? build(Number(match[1]), month, Number(match[3])) : null;
  }
  return null;
}

/**
 * Amount on the first line that starts with one of `labels`. Prefers a figure
 * marked UGX/Shs, then the last comma-grouped figure, so rates and months
 * printed on the same line ("Interest at 2% for 4 months: UGX 2,208,000") are skipped.
 */
function amountAfter(text: string, labels: string): number | null {
  const lines = text.match(new RegExp(String.raw`(?:^|\n)[ \t|]*(?:${labels})\b[^\n]*`, "gi")) ?? [];
  for (const line of lines) {
    const marked = [...line.matchAll(/(?:UGX|Ushs?\.?|Shs?\.?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)].map((m) => m[1]);
    const grouped = [...line.matchAll(/\b([0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?\b/g)].map((m) => m[1]);
    const plain = [...line.matchAll(new RegExp(AMOUNT, "gi"))].map((m) => m[1]).filter((v) => v && !/%/.test(v));
    const pick = marked[marked.length - 1] ?? grouped[grouped.length - 1] ?? (plain.length ? plain[plain.length - 1] : undefined);
    if (pick) {
      const value = Number(pick.replace(/,/g, ""));
      if (Number.isFinite(value)) return Math.round(value);
    }
  }
  return null;
}

function dateAfter(text: string, labels: string): string | null {
  const match = text.match(new RegExp(String.raw`(?:${labels})\s*[:\-]?\s*${DATE}`, "i"));
  return match?.[1] ? parseNoticeDate(match[1]) : null;
}

/** Deterministic reader for typed or pasted notice text. Confidence is modest by design. */
export function readNoticeText(input: string): Extraction {
  const text = String(input ?? "").slice(0, 100_000);
  if (text.trim().length < 40) throw new MalformedExtractionError("There is not enough text to read. Paste the whole notice, or upload a PDF or photo.");
  const fields: ExtractedField[] = [];
  const put = (fieldName: ConfirmableField, value: string | null, confidence: number) => fields.push({ fieldName, value, confidence: value === null ? 0 : confidence });

  const tin = text.match(/\bTIN\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d{10})\b/i);
  put("tin", tin?.[1] ?? null, 0.8);

  // PAYE and WHT notices also say "income tax", so they are checked first. An
  // income tax notice often mentions withholding tax only as a credit, so WHT
  // needs a stronger signal than the words "withholding tax".
  const paye = /\bPAYE\b|\bpay\s+as\s+you\s+earn\b/i.test(text);
  const wht = /\bwithholding\s+tax\s+assessment\b|\bassessment\s*[-–:]\s*withholding\s+tax\b|\bfailure\s+to\s+withhold\b|\bwithholding\s+agent\b/i.test(text);
  const vat = /\b(?:value\s+added\s+tax|VAT)\b/i.test(text);
  const income = /\bincome\s+tax\b|\bcorporation\s+tax\b/i.test(text);
  if (paye !== wht) put("tax_head", paye ? "paye" : "wht", 0.7);
  else if (paye && wht) put("tax_head", null, 0);
  else put("tax_head", vat && !income ? "vat" : income && !vat ? "income_tax" : null, 0.75);

  const type = /\badditional\s+assessment\b/i.test(text) ? "additional"
    : /\boriginal\s+assessment\b/i.test(text) ? "original"
      : /\b(?:amended|estimated|default|jeopardy)\s+assessment\b/i.test(text) ? "other" : null;
  put("assessment_type", type, 0.7);

  let start: string | null = null;
  let end: string | null = null;
  const range = text.match(new RegExp(String.raw`(?:tax\s+period|period(?:\s+assessed)?|year\s+of\s+income|accounting\s+period)\s*[:\-]?\s*(?:from\s+)?${DATE}\s*(?:to|-|–|until)\s*${DATE}`, "i"));
  if (range?.[1] && range[2]) {
    start = parseNoticeDate(range[1]);
    end = parseNoticeDate(range[2]);
  } else {
    const month = text.match(/(?:tax\s+period|period)\s*[:\-]?\s*([A-Za-z]{3,9})\s+(\d{4})\b/i);
    const monthNo = month ? MONTHS[(month[1] ?? "").slice(0, 3).toLowerCase()] : undefined;
    if (month && monthNo) {
      const year = Number(month[2]);
      start = `${year}-${String(monthNo).padStart(2, "0")}-01`;
      end = new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10);
    }
  }
  put("period_start", start, 0.7);
  put("period_end", end, 0.7);
  put("date_issued", dateAfter(text, String.raw`date\s+of\s+(?:assessment|issue|notice)|assessment\s+date|issue\s+date|date\s+issued|dated`), 0.7);

  const principal = amountAfter(text, String.raw`principal\s+tax|tax\s+assessed|assessed\s+tax|tax\s+payable|principal`);
  const penal = amountAfter(text, String.raw`penal\s+tax|penalty|penalties`);
  const interest = amountAfter(text, String.raw`interest`);
  put("principal", principal === null ? null : String(principal), 0.7);
  put("penal_tax", penal === null ? null : String(penal), 0.7);
  put("interest", interest === null ? null : String(interest), 0.7);

  const rate = text.match(/(\d+(?:\.\d+)?)\s*%\s*per\s*month(?:[^.\n]{0,40}?\bfor\s+(\d{1,3})\s+months?)?/i);
  put("interest_rate_percent_per_month", rate?.[1] ?? null, 0.6);
  const months = rate?.[2] ?? text.match(/\binterest\b[^.\n]{0,60}?\b(\d{1,3})\s+months?\b/i)?.[1] ?? null;
  put("interest_months", months, 0.6);
  put("penal_tax_percent", text.match(/penal\s+tax[^.\n%]{0,40}?(\d+(?:\.\d+)?)\s*%/i)?.[1] ?? null, 0.6);

  const reasons = text.match(/(?:^|\n)[ \t]*(?:reasons?(?:\s+for\s+(?:the\s+)?assessment)?|basis\s+of\s+(?:the\s+)?assessment|grounds?)\s*[:\-]\s*([\s\S]+?)(?:\n\s*\n|$)/i);
  put("ura_reasons", reasons?.[1] ? reasons[1].replace(/\s+/g, " ").trim().slice(0, 2000) : null, 0.6);

  const provisions = [...text.matchAll(/\b(?:section|sec\.|s\.)\s?\d+[A-Z]?(?:\(\w+\))*\s+of\s+the\s+[A-Z][A-Za-z ]{2,60}?(?:Act|Code)(?:,?\s+Cap\.?\s*\d+)?/g)].map((m) => m[0].trim());
  put("provisions_cited", JSON.stringify([...new Set(provisions)].slice(0, 30)), provisions.length ? 0.7 : 0);

  const warnings = ["Read from text by TaxComp's built-in reader. Check every figure against the notice."];
  const total = amountAfter(text, String.raw`total(?:\s+amount)?(?:\s+(?:due|payable))?`);
  if (total !== null && principal !== null && penal !== null && interest !== null && principal + penal + interest !== total) {
    warnings.push(`Tax + penal tax + interest (${(principal + penal + interest).toLocaleString("en-US")}) does not equal the total on the notice (${total.toLocaleString("en-US")}).`);
  }
  return { source: "text-reader", fields, warnings };
}
