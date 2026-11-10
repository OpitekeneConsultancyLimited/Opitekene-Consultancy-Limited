// F5 (law half): which statute versions apply to an assessment's tax period.
// Pure. Bills are never applied. A version can be cited while its wording is
// unverified, but it is used for computation only when approved.
import { formatDate } from "./dates.mts";
import type { IsoDate, ItemCategory, ProvisionVersion, Statute, TaxHead } from "./types.mts";

const ENACTED = new Set<Statute["billStatus"]>(["assented", "in_force"]);

export const STATUTES_FOR_HEAD: Record<TaxHead, string[]> = {
  income_tax: ["ita", "tpca", "tata"],
  vat: ["vata", "tpca", "tata"],
};

export const TOPICS_FOR_CATEGORY: Record<ItemCategory, string[]> = {
  expense: ["expense-deductibility", "burden-of-proof"],
  income: ["burden-of-proof"],
  input_vat: ["input-vat", "burden-of-proof"],
  output_vat: ["burden-of-proof"],
  credit: ["burden-of-proof"],
  interest: ["interest"],
  penal_tax: ["penal-tax"],
  procedural: ["objection-procedure"],
  other: ["burden-of-proof"],
};

export interface Citation {
  provisionId: string;
  label: string;
  heading: string;
  sourceUrl: string | null;
  textVerified: boolean;
  approvedForComputation: boolean;
  appliesFrom: IsoDate | null;
  appliesTo: IsoDate | null;
  amendedBy: string | null;
}

export interface LawResolution {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  statutes: Array<{ id: string; title: string; chapter: string | null; sourceUrl: string | null }>;
  amendmentsApplied: Array<{ id: string; title: string; appliesFromPeriod: IsoDate | null }>;
  amendmentsNotApplied: Array<{ id: string; title: string; reason: string }>;
  notes: Array<{ text: string; sourceUrl: string | null }>;
  byTopic: Record<string, Citation[]>;
}

export function citationLabel(version: ProvisionVersion, statute: Statute | undefined): string {
  const title = statute ? `${statute.title}${statute.chapter ? ` ${statute.chapter}` : ""}` : version.statuteId;
  const section = version.section === "TODO_VERIFY" ? "section to be confirmed" : `section ${version.section}`;
  return `${title}, ${section}`;
}

function overlaps(version: ProvisionVersion, start: IsoDate, end: IsoDate): boolean {
  return (!version.appliesFromPeriod || version.appliesFromPeriod <= end) && (!version.appliesToPeriod || version.appliesToPeriod >= start);
}

export function resolveLaw(
  { taxHead, periodStart, periodEnd }: { taxHead: TaxHead; periodStart: IsoDate; periodEnd: IsoDate },
  statutes: Statute[],
  versions: ProvisionVersion[],
): LawResolution {
  const byId = new Map(statutes.map((item) => [item.id, item]));
  const principals = STATUTES_FOR_HEAD[taxHead].map((id) => byId.get(id)).filter((item): item is Statute => Boolean(item));
  const principalIds = new Set(principals.map((item) => item.id));

  const applied: LawResolution["amendmentsApplied"] = [];
  const notApplied: LawResolution["amendmentsNotApplied"] = [];
  const notes: LawResolution["notes"] = [];
  for (const amendment of statutes.filter((item) => item.kind === "amendment" && item.parentId && principalIds.has(item.parentId))) {
    if (!ENACTED.has(amendment.billStatus)) {
      notApplied.push({ id: amendment.id, title: amendment.title, reason: `Not law: status is "${amendment.billStatus}".` });
      continue;
    }
    if (amendment.appliesFromPeriod && amendment.appliesFromPeriod > periodEnd) {
      notApplied.push({ id: amendment.id, title: amendment.title, reason: `Applies only from ${formatDate(amendment.appliesFromPeriod)}, after this tax period.` });
      continue;
    }
    applied.push({ id: amendment.id, title: amendment.title, appliesFromPeriod: amendment.appliesFromPeriod });
    if (amendment.assentDate && amendment.appliesFromPeriod && amendment.assentDate > amendment.appliesFromPeriod) {
      const returned = amendment.returnedDate ? ` The Bill was returned by the President on ${formatDate(amendment.returnedDate)}.` : "";
      notes.push({ sourceUrl: amendment.sourceUrl, text: `${amendment.title}: assented on ${formatDate(amendment.assentDate)}, but URA applies it from ${formatDate(amendment.appliesFromPeriod)}, so it covers this period.${returned} A professional should consider whether applying it to a period that began before assent can be questioned.` });
    }
    if (amendment.appliesFromPeriod && amendment.appliesFromPeriod > periodStart) {
      notes.push({ sourceUrl: amendment.sourceUrl, text: `This tax period starts before ${formatDate(amendment.appliesFromPeriod)}: the law before and after the ${amendment.title} may both apply to parts of it.` });
    }
  }
  const appliedIds = new Set(applied.map((item) => item.id));

  const byTopic: Record<string, Citation[]> = {};
  for (const version of versions) {
    if (!principalIds.has(version.statuteId)) continue;
    if (!ENACTED.has(version.billStatus)) continue;
    if (version.amendedByStatuteId && !appliedIds.has(version.amendedByStatuteId)) continue;
    if (!overlaps(version, periodStart, periodEnd)) continue;
    const list = byTopic[version.topic] ?? (byTopic[version.topic] = []);
    list.push({
      provisionId: version.id,
      label: citationLabel(version, byId.get(version.statuteId)),
      heading: version.heading,
      sourceUrl: version.sourceUrl,
      textVerified: version.textVerified,
      approvedForComputation: version.approvedForComputation,
      appliesFrom: version.appliesFromPeriod,
      appliesTo: version.appliesToPeriod,
      amendedBy: version.amendedByStatuteId,
    });
  }
  // Newest version first within each topic.
  for (const list of Object.values(byTopic)) list.sort((a, b) => (b.appliesFrom ?? "").localeCompare(a.appliesFrom ?? ""));

  return {
    periodStart, periodEnd,
    statutes: principals.map((item) => ({ id: item.id, title: item.title, chapter: item.chapter, sourceUrl: item.sourceUrl })),
    amendmentsApplied: applied, amendmentsNotApplied: notApplied, notes, byTopic,
  };
}

/** The approved computation formula for a topic in this period, or null. */
export function approvedFormula(versions: ProvisionVersion[], resolution: LawResolution, topic: string): ProvisionVersion | null {
  const ids = new Set((resolution.byTopic[topic] ?? []).filter((c) => c.approvedForComputation).map((c) => c.provisionId));
  return versions.find((version) => ids.has(version.id)) ?? null;
}
