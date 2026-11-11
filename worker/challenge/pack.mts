// F6 Response pack content. Pure. The browser turns this into DOCX / PDF.
// Every string passes the banned-phrase filter; legal points carry citations.
import { formatDate, formatUgx } from "./dates.mts";
import type { CaseView } from "./record.mts";
import { assertSafe } from "./safety.mts";
import { OUTCOME_PROFESSIONAL_LABELS, TAX_HEAD_LABEL, TAX_HEAD_PACK_TITLE } from "./wording.mts";

export interface PackParagraph { text: string; citations?: Array<{ label: string; sourceUrl: string | null }> }
export interface PackTable { headers: string[]; rows: string[][] }
export interface PackDocument {
  id: "late-objection-request" | "objection-letter" | "evidence-checklist" | "schedules" | "management-briefing";
  title: string;
  draft: boolean;
  blocks: Array<{ heading?: string; paragraphs?: PackParagraph[]; table?: PackTable; bullets?: string[] }>;
}
export interface Pack {
  caseId: string;
  generatedOn: string;
  provisionalNotice: string | null;
  documents: PackDocument[];
}

const money = (value: number | null) => (value === null ? "[CONFIRM AMOUNT]" : formatUgx(value));

function groundsBlocks(view: CaseView): PackDocument["blocks"] {
  const kept = view.reconciliation.grounds.filter((item) => item.keepInObjection);
  if (!kept.length) return [{ paragraphs: [{ text: "[STATE each ground of objection, with the facts and the documents that support it.]" }] }];
  return kept.map((item, index) => {
    const research = view.research.find((entry) => entry.itemId === item.itemId);
    const citations = [
      ...(research?.provisions ?? []).map((p) => ({ label: p.label, sourceUrl: p.sourceUrl })),
      ...(research?.cases ?? []).slice(0, 3).map((c) => ({ label: c.citation, sourceUrl: c.sourceUrl })),
    ];
    const figures = item.correctedFigure !== null
      ? ` URA's figure is ${money(item.uraAmount)}; the taxpayer's computation gives ${money(item.correctedFigure)}.`
      : item.difference !== null ? ` URA's figure is ${money(item.uraAmount)}; the taxpayer's records show ${money(item.taxpayerAmount)}.` : "";
    return {
      heading: `Ground ${index + 1}: ${item.description}`,
      paragraphs: [
        { text: `${item.outcomeLabel}.${figures} ${item.reason}`.trim(), citations },
        ...(item.evidenceGap.length ? [{ text: `Supporting documents to attach: ${item.evidenceGap.join("; ")}.` }] : []),
      ],
    };
  });
}

export function buildPack(view: CaseView, generatedOn: string): Pack {
  const row = view.case;
  const deadlines = view.deadlines;
  const head = row.taxHead ? TAX_HEAD_PACK_TITLE[row.taxHead] : "[CONFIRM TAX]";
  const period = row.periodStart && row.periodEnd ? `${formatDate(row.periodStart)} to ${formatDate(row.periodEnd)}` : "[CONFIRM PERIOD]";
  const total = (row.principal ?? 0) + (row.penalTax ?? 0) + (row.interest ?? 0);
  const objectionCitation = (view.law?.byTopic["objection-procedure"] ?? []).map((p) => ({ label: p.label, sourceUrl: p.sourceUrl }));
  const ruleCitation = [{ label: `${deadlines.objection.ruleLabel} (rule set ${deadlines.ruleSetVersion})`, sourceUrl: deadlines.objection.sourceUrl }];

  const objectionLetter: PackDocument = {
    id: "objection-letter", title: `Notice of objection: ${row.taxHead ? TAX_HEAD_LABEL[row.taxHead].replace(/^(?!VAT|PAYE)\w/, (c) => c.toLowerCase()) : "tax"} assessment`, draft: true,
    blocks: [
      { paragraphs: [{ text: "DRAFT: check every detail, and have it reviewed, before you lodge it with URA." }] },
      { paragraphs: [{ text: "The Commissioner General, Uganda Revenue Authority" }, { text: "[CONFIRM the URA office or the URA portal objection channel]" }, { text: `Date: [DATE OF LODGEMENT]` }] },
      { heading: `RE: OBJECTION TO ${head} ASSESSMENT FOR ${period.toUpperCase()}`, paragraphs: [
        { text: `Taxpayer: [TAXPAYER NAME]    TIN: ${row.tin ?? "[CONFIRM TIN]"}` },
        { text: `Assessment dated ${row.dateIssued ? formatDate(row.dateIssued) : "[CONFIRM DATE]"}, received on ${row.dateServed ? formatDate(row.dateServed) : "[CONFIRM DATE OF RECEIPT]"}.` },
        { text: "We object to the assessment for the reasons set out below.", citations: [...objectionCitation, ...ruleCitation] },
      ] },
      { heading: "Amounts assessed", table: { headers: ["Item", "Amount"], rows: [
        ["Principal tax", money(row.principal)], ["Penal tax", money(row.penalTax)], ["Interest", money(row.interest)], ["Total", formatUgx(total)],
        ["Tax the taxpayer accepts", row.taxAccepted === null ? "[CONFIRM]" : formatUgx(row.taxAccepted)],
      ] } },
      { heading: "Grounds of objection", paragraphs: [{ text: "Every arguable ground is listed, because grounds not raised now may not be heard later. Remove any you decide not to pursue." }] },
      ...groundsBlocks(view),
      { heading: "Request", paragraphs: [{ text: "We ask the Commissioner to review the assessment on these grounds and to amend it, with penal tax and interest adjusted to match." }] },
      { paragraphs: [{ text: "Attached: [LIST the supporting documents]." }, { text: "Yours faithfully," }, { text: "[NAME, TITLE AND SIGNATURE]" }] },
    ],
  };

  const documents: PackDocument[] = [];
  if (deadlines.lateObjection.offered) {
    documents.push({
      id: "late-objection-request", title: "Request to accept a late objection", draft: true,
      blocks: [
        { paragraphs: [{ text: "DRAFT: a professional should review this request before it is sent." }] },
        { paragraphs: [{ text: `The time to object appears to have ended on ${deadlines.objection.dueDate ? formatDate(deadlines.objection.dueDate) : "[DATE]"}. We ask the Commissioner to accept the attached objection out of time.`, citations: [{ label: "Late objection (published rule)", sourceUrl: deadlines.lateObjection.sourceUrl }] }] },
        { heading: "Reason for the delay", paragraphs: [{ text: row.lateReason || "[STATE the reason: absence from Uganda, sickness or another reasonable cause, with supporting evidence]" }] },
        { paragraphs: [{ text: "We acted without unreasonable delay once the reason ended: [EXPLAIN the dates]." }] },
      ],
    });
  }
  documents.push(objectionLetter);

  documents.push({
    id: "evidence-checklist", title: "Evidence checklist", draft: false,
    blocks: [{ table: { headers: ["Document", "Why", "Status"], rows: view.checklist.map((item) => [item.text, item.why, item.status === "needed" ? "Still needed" : item.status === "received" ? "Have it" : "Not available"]) } }],
  });

  documents.push({
    id: "schedules", title: "Supporting schedules", draft: false,
    blocks: [
      { heading: "Schedule 1: URA's figures against the taxpayer's records", table: { headers: ["Item", "URA", "Records", "Difference", "Outcome", "Schedule"],
        rows: view.reconciliation.items.map((item) => [item.description, money(item.uraAmount), money(item.taxpayerAmount), item.difference === null ? "-" : formatUgx(item.difference), OUTCOME_PROFESSIONAL_LABELS[item.outcome], item.schedule]) } },
      { heading: "Schedule 2: recomputed penal tax and interest", table: { headers: ["Item", "URA", "Recomputed", "Working"],
        rows: view.reconciliation.items.filter((item) => item.recomputation).map((item) => [item.description, money(item.uraAmount), money(item.recomputation?.expected ?? null), item.recomputation?.workings ?? ""]) } },
      { heading: "Schedule 3: deadlines", table: { headers: ["Stage", "Last day", "Rule"],
        rows: [deadlines.objection, deadlines.decision, deadlines.tatApplication].filter((b): b is NonNullable<typeof b> => Boolean(b)).map((b) => [b.ruleLabel, b.dueDate ? formatDate(b.dueDate) : "Unknown", `${b.ruleSetVersion}${b.provisional ? " (provisional)" : ""}`]) } },
    ],
  });

  documents.push({
    id: "management-briefing", title: "Management briefing (one page)", draft: false,
    blocks: [
      { heading: "What URA is claiming", paragraphs: view.explanation.owner.map((text) => ({ text })) },
      { heading: "Deadline", paragraphs: [{ text: `${deadlines.objection.title}. ${deadlines.objection.message}`, citations: ruleCitation }] },
      { heading: "Where we stand", bullets: view.reconciliation.items.map((item) => `${item.description}: ${item.ownerText}`) },
      ...(deadlines.tatPayment.amount !== null ? [{ heading: "If this goes to the Tribunal", paragraphs: [{ text: `About ${formatUgx(deadlines.tatPayment.amount)} would have to be paid first. ${deadlines.tatPayment.basis}`, citations: [{ label: "Payment before the Tribunal (published rule)", sourceUrl: deadlines.tatPayment.sourceUrl }] }] }] : []),
      { heading: "Next step", paragraphs: [{ text: view.nextStep }] },
      { paragraphs: [{ text: view.disclaimer }] },
    ],
  });

  const pack: Pack = { caseId: row.id, generatedOn, provisionalNotice: deadlines.provisionalLabel, documents };
  assertSafe(pack, "pack");
  return pack;
}
