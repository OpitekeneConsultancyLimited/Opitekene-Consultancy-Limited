// Output safety (brief Section 6): blocks over-confident wording and legal
// statements without a citation. All AI text and every pack passes through here.

// Each pattern catches a banned phrase and close variants (word order,
// contractions, synonyms, light obfuscation such as extra spaces).
const BANNED: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "assessment-invalid", pattern: /\b(?:the\s+|this\s+|your\s+|URA'?s\s+)?assessments?\s+(?:is|are|was|were|being)\s+(?:clearly\s+|plainly\s+|definitely\s+|totally\s+|completely\s+|wholly\s+)?(?:invalid|void|null(?:\s+and\s+void)?|illegal|unlawful|bad\s+in\s+law)\b/i },
  { id: "invalid-assessment", pattern: /\b(?:invalid|void|illegal|unlawful)\s+assessments?\b/i },
  { id: "you-will-win", pattern: /\b(?:you|we|your\s+(?:objection|appeal|case))\s*(?:will|'ll|shall|are\s+going\s+to|are\s+sure\s+to|are\s+certain\s+to|cannot\s+fail\s+to|can'?t\s+lose)\s*(?:definitely\s+|certainly\s+|surely\s+)?(?:win|succeed|prevail|be\s+successful|beat\s+URA)\b/i },
  { id: "certain-to-win", pattern: /\b(?:certain|sure|bound)\s+to\s+(?:win|succeed|prevail)\b|\b(?:can(?:not|'t)|won'?t)\s+lose\b/i },
  { id: "ura-is-wrong", pattern: /\bURA\s*(?:is|was|are|'s)\s*(?:clearly\s+|plainly\s+|definitely\s+|simply\s+|totally\s+)?(?:wrong|mistaken|incorrect|in\s+error)\b/i },
  { id: "guaranteed", pattern: /\bguarantee(?:d|s|ing)?\b|\bg\s*u\s*a\s*r\s*a\s*n\s*t\s*e\s*e\s*d?\b/i },
  { id: "no-doubt", pattern: /\b(?:100\s*%|one\s+hundred\s+per\s*cent)\s+(?:sure|certain|chance|success)\b|\bwithout\s+(?:any\s+)?doubt\b/i },
];

export interface SafetyResult {
  ok: boolean;
  blocked: string[];
}

export function checkBannedPhrases(text: string): SafetyResult {
  const normalized = String(text ?? "").replace(/[‘’]/g, "'").replace(/\s+/g, " ");
  const blocked = BANNED.filter((rule) => rule.pattern.test(normalized)).map((rule) => rule.id);
  return { ok: blocked.length === 0, blocked };
}

/** Throws if any string inside `value` (deeply) contains a banned phrase. */
export function assertSafe(value: unknown, where = "output"): void {
  const problems: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") {
      const result = checkBannedPhrases(node);
      if (!result.ok) problems.push(`${path}: ${result.blocked.join(", ")}`);
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) walk(item, `${path}.${key}`);
    }
  };
  walk(value, where);
  if (problems.length) throw new UnsafeOutputError(problems);
}

export class UnsafeOutputError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Blocked wording in ${problems.length} place(s).`);
    this.name = "UnsafeOutputError";
    this.problems = problems;
  }
}

/** Removes sentences containing banned phrases (for untrusted AI text). */
export function scrubSentences(text: string): { text: string; removed: number } {
  const sentences = String(text ?? "").split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => checkBannedPhrases(sentence).ok);
  return { text: kept.join(" ").trim(), removed: sentences.length - kept.length };
}

export interface LegalStatement {
  text: string;
  citations: Array<{ label: string; sourceUrl: string | null }>;
}

/** Brief rule: a legal statement with no citation is not shown. */
export function citedOnly<T extends LegalStatement>(statements: T[]): T[] {
  return statements.filter((statement) => statement.citations.some((citation) => citation.label && citation.sourceUrl));
}
