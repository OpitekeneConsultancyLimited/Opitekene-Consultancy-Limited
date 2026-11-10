// Synthetic URA-style assessment notices for the EXT-1 harness. Every notice,
// name, TIN and figure here is invented for testing; none is a real assessment
// and the layout is not a copy of a URA form. Deterministic (no randomness).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (n) => n.toLocaleString("en-US");
const dmy = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const long = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const AMOUNT_STYLES = [(n) => `UGX ${fmt(n)}`, (n) => `Shs. ${fmt(n)}`, (n) => `${fmt(n)}/=`, (n) => `UGX ${fmt(n)}.00`];
const PRINCIPAL_LABELS = ["Principal tax", "Tax assessed", "Tax payable", "Principal Tax Due"];
const PENAL_LABELS = ["Penal tax", "Penalty", "Penal Tax"];

export function generateSamples() {
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    const vat = i % 2 === 1;
    const year = 2024 + (i % 3);
    const month = (i * 5) % 12 + 1;
    const monthly = vat || i % 4 === 0;
    const periodStart = monthly ? `${year}-${String(month).padStart(2, "0")}-01` : `${year - 1}-07-01`;
    const periodEnd = monthly ? `${year}-${String(month).padStart(2, "0")}-${lastDay(year, month)}` : `${year}-06-30`;
    const principal = 1_250_000 + i * 3_317_000;
    const penalPercent = [10, 20, 30][i % 3];
    const penal = Math.round(principal * penalPercent / 100);
    const rate = 2;
    const months = 1 + (i % 7);
    const interest = Math.round(principal * rate / 100 * months);
    const issued = `${year + (monthly ? 0 : 0)}-${String(((month + 2) % 12) + 1).padStart(2, "0")}-${String(5 + i).padStart(2, "0")}`;
    const amount = AMOUNT_STYLES[i % AMOUNT_STYLES.length];
    const tin = String(1000000000 + i * 7919).padStart(10, "0");
    const head = vat ? "VALUE ADDED TAX" : "INCOME TAX";
    const type = i % 3 === 0 ? "ORIGINAL ASSESSMENT" : "ADDITIONAL ASSESSMENT";
    const period = monthly && i % 3 === 0
      ? `Tax period: ${MONTHS[month - 1]} ${year}`
      : i % 2 === 0 ? `Tax Period: ${dmy(periodStart)} to ${dmy(periodEnd)}` : `Period assessed: ${long(periodStart)} - ${long(periodEnd)}`;
    const table = i % 5 === 4;
    const lines = [
      "SYNTHETIC TEST DOCUMENT - NOT A REAL URA NOTICE",
      "UGANDA REVENUE AUTHORITY (sample layout)",
      `NOTICE OF ${type} - ${head}`,
      `Taxpayer: Sample Trading ${i + 1} Ltd`,
      `TIN: ${tin}`,
      period,
      `Date of assessment: ${i % 2 ? long(issued) : dmy(issued)}`,
      "",
      ...(table
        ? ["| Item | Amount |", `| ${PRINCIPAL_LABELS[i % 4]} | ${amount(principal)} |`, `| ${PENAL_LABELS[i % 3]} at ${penalPercent}% | ${amount(penal)} |`, `| Interest at ${rate}% per month for ${months} months | ${amount(interest)} |`, `| Total amount due | ${amount(principal + penal + interest)} |`]
        : [`${PRINCIPAL_LABELS[i % 4]}: ${amount(principal)}`, `${PENAL_LABELS[i % 3]} at ${penalPercent}%: ${amount(penal)}`, `Interest at ${rate}% per month for ${months} months: ${amount(interest)}`, `Total amount due: ${amount(principal + penal + interest)}`]),
      "",
      `Reasons: ${vat ? "Input tax claimed was not supported by valid tax invoices." : "Expenses claimed were not supported by documents."}`,
      "",
      "Issued under the Tax Procedures Code Act (section not shown in this synthetic sample).",
    ];
    samples.push({
      id: `sample-${String(i + 1).padStart(2, "0")}`,
      text: lines.join("\n"),
      truth: { taxHead: vat ? "vat" : "income_tax", principal, penalTax: penal, interest, periodStart, periodEnd },
    });
  }
  return samples;
}

/** EXT-1 scoring: a sample passes when principal, penal tax, interest and period are all correct. */
export function scoreExtraction(extraction, truth) {
  const get = (name) => extraction.fields.find((field) => field.fieldName === name)?.value ?? null;
  const checks = {
    principal: Number(get("principal")) === truth.principal,
    penalTax: Number(get("penal_tax")) === truth.penalTax,
    interest: Number(get("interest")) === truth.interest,
    period: get("period_start") === truth.periodStart && get("period_end") === truth.periodEnd,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}
