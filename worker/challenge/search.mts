// F5 (cases half): issue tagging and plain-English case search. Pure.
// Keyword search plus tags (the stack has no embeddings service).
import type { CaseLaw, ItemCategory } from "./types.mts";

export interface IssueTag {
  id: string;
  label: string;
  /** Matched against judgment text at ingestion and against a user's query. */
  patterns: RegExp[];
}

export const ISSUE_TAGS: ReadonlyArray<IssueTag> = [
  { id: "expense-deductibility", label: "Expense deductibility", patterns: [/\bdeduct(?:ible|ibility|ion|ions|ed)?\b/i, /\bexpen(?:se|ses|diture)\b[^.]{0,60}\b(?:disallow\w*|allow\w*)\b/i, /\bdisallow\w*\b[^.]{0,60}\bexpen\w*/i, /\bwholly\s+and\s+exclusively\b/i] },
  { id: "burden-of-proof", label: "Burden of proof and evidence", patterns: [/\bburden\s+of\s+proo?f\b/i, /\bonus\b/i, /\b(?:lack|absence|insufficien\w*)\s+of\s+(?:evidence|proof|records|documents)\b/i, /\bsupporting\s+documents?\b/i, /\bno\s+evidence\b/i, /\bevidence\b/i] },
  { id: "input-vat", label: "Input VAT claims", patterns: [/\binput\s+(?:vat|tax)\b/i, /\btax\s+invoices?\b/i, /\befris\b/i] },
  { id: "objection-procedure", label: "Assessment and objection procedure", patterns: [/\bobjection\b/i, /\bout\s+of\s+time\b/i, /\bextension\s+of\s+time\b/i, /\btime\s*-?\s*barred\b/i, /\bservice\s+of\s+(?:the\s+)?(?:assessment|notice)\b/i, /\badditional\s+assessment\b/i] },
  { id: "penal-tax", label: "Penal tax", patterns: [/\bpenal\s+tax\b/i, /\bpenalt(?:y|ies)\b/i] },
  { id: "interest", label: "Interest", patterns: [/\binterest\s+on\s+(?:unpaid|late|outstanding)\s+tax\b/i, /\binterest\b[^.]{0,40}\bper\s+(?:month|annum)\b/i, /\bwaiver\s+of\s+(?:interest|penalt)/i] },
  { id: "paye", label: "PAYE and employment income", patterns: [/\bpaye\b/i, /\bpay\s+as\s+you\s+earn\b/i, /\bemployment\s+income\b/i, /\bemoluments?\b/i, /\bfringe\s+benefits?\b/i, /\ballowances?\b[^.]{0,40}\bemployees?\b/i] },
  { id: "withholding", label: "Withholding tax", patterns: [/\bwithholding\s+tax\b/i, /\bwithholding\s+agent\b/i, /\bwht\b/i, /\bfailure\s+to\s+withhold\b/i, /\bexemption\s+certificate\b/i] },
];

export const TAGS_FOR_CATEGORY: Readonly<Record<ItemCategory, string[]>> = {
  expense: ["expense-deductibility", "burden-of-proof"],
  income: ["burden-of-proof"],
  input_vat: ["input-vat", "burden-of-proof"],
  output_vat: ["burden-of-proof"],
  credit: ["burden-of-proof"],
  interest: ["interest"],
  penal_tax: ["penal-tax"],
  procedural: ["objection-procedure"],
  other: [],
  employment_income: ["paye", "burden-of-proof"],
  withholding: ["withholding", "burden-of-proof"],
};

/** Tags whose patterns match at least `minHits` times in a judgment's text. */
export function tagText(text: string, minHits = 2): string[] {
  const tags: string[] = [];
  for (const tag of ISSUE_TAGS) {
    let hits = 0;
    for (const pattern of tag.patterns) {
      const global = new RegExp(pattern.source, "gi");
      hits += [...text.matchAll(global)].length;
    }
    if (hits >= minHits) tags.push(tag.id);
  }
  return tags;
}

const STOP = new Set(["the", "a", "an", "my", "our", "for", "of", "to", "and", "or", "in", "on", "by", "was", "were", "is", "are", "be", "it", "that", "this", "with", "ura", "me", "we", "i", "they", "because", "due", "lack"]);
const SYNONYMS: Record<string, string[]> = {
  expense: ["expense", "expenses", "expenditure", "deduction", "deductible"],
  disallow: ["disallow", "disallowed", "disallowance", "rejected"],
  evidence: ["evidence", "proof", "records", "documents", "receipts", "invoices"],
  invoice: ["invoice", "invoices", "receipt", "receipts", "efris"],
  input: ["input", "vat", "credit"],
  penalty: ["penalty", "penal", "penalties"],
  interest: ["interest"],
  objection: ["objection", "object", "late", "extension"],
  paye: ["paye", "salary", "salaries", "allowance", "allowances", "benefit", "benefits", "employee", "employees", "payroll"],
  withhold: ["withhold", "withholding", "withheld", "wht"],
};

function stem(word: string): string {
  return word.replace(/(?:ies)$/, "y").replace(/(?:es|s)$/, "").replace(/(?:ed|ing)$/, "");
}

export function queryTerms(query: string): string[] {
  const words = String(query ?? "").toLowerCase().match(/[a-z]+/g) ?? [];
  const terms = new Set<string>();
  for (const word of words) {
    if (STOP.has(word) || word.length < 3) continue;
    terms.add(stem(word));
    for (const [root, list] of Object.entries(SYNONYMS)) {
      if (list.includes(word) || stem(word) === root) for (const synonym of list) terms.add(stem(synonym));
    }
  }
  return [...terms];
}

export function queryTags(query: string): string[] {
  return ISSUE_TAGS.filter((tag) => tag.patterns.some((pattern) => pattern.test(query))
    || (tag.id === "burden-of-proof" && /\b(?:evidence|proof|records|documents|receipts)\b/i.test(query))
    || (tag.id === "expense-deductibility" && /\bexpen\w*/i.test(query))).map((tag) => tag.id);
}

export interface CaseMatch {
  caseLaw: CaseLaw;
  score: number;
  matchedTags: string[];
}

export function searchCases(cases: CaseLaw[], query: string, { limit = 10, tags = [] as string[] } = {}): CaseMatch[] {
  const terms = queryTerms(query);
  const wanted = new Set([...queryTags(query), ...tags]);
  const matches: CaseMatch[] = [];
  for (const item of cases) {
    const haystack = `${item.citation} ${item.parties} ${item.searchTerms} ${item.principle ?? ""} ${item.legalQuestion ?? ""}`.toLowerCase();
    const words = new Set((haystack.match(/[a-z]+/g) ?? []).map(stem));
    const matchedTags = item.issueTags.filter((tag) => wanted.has(tag));
    const termHits = terms.filter((term) => words.has(term)).length;
    const score = matchedTags.length * 3 + termHits;
    if (matchedTags.length > 0 || termHits >= 2) matches.push({ caseLaw: item, score, matchedTags });
  }
  return matches.sort((a, b) => b.score - a.score || (b.caseLaw.decisionDate ?? "").localeCompare(a.caseLaw.decisionDate ?? "")).slice(0, limit);
}
