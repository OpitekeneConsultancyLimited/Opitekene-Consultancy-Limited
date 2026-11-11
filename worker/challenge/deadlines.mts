// F2 Deadline engine. Pure: rule data in, banners out. Every date names the
// rule that produced it; nothing is computed from the issue date.
import { addDays, daysBetween, formatDate, formatUgx, isWeekend } from "./dates.mts";
import type { IsoDate, ProcedureRule, PublicHoliday, RuleSet } from "./types.mts";

export type BannerState = "unknown" | "on_track" | "urgent" | "possibly_lapsed";

export interface Banner {
  key: "objection" | "objection_decision" | "tat_application";
  state: BannerState | "waiting" | "passed";
  title: string;
  message: string;
  dueDate: IsoDate | null;
  daysLeft: number | null;
  ruleKey: ProcedureRule["ruleKey"];
  ruleLabel: string;
  ruleSetVersion: string;
  sourceUrl: string | null;
  provisional: boolean;
  /** Counting assumptions shown in the professional view (TODO_VERIFY flags). */
  assumptions: string[];
  /**
   * Set when the last day falls on a weekend or a listed public holiday:
   * offices may be closed, so the user is told to lodge by the working day
   * before. This only ever moves the user earlier.
   */
  closedDay: { reason: string; lodgeBy: IsoDate } | null;
}

export interface DeadlineInput {
  today: IsoDate;
  dateServed: IsoDate | null;
  objectionFiledOn: IsoDate | null;
  decisionServedOn: IsoDate | null;
  /** Confirmed principal tax assessed. */
  taxAssessed: number | null;
  /** Tax the taxpayer accepts (not in dispute). */
  taxNotInDispute: number | null;
  /** Listed public holidays (verified or not); see dueDateFor and closedDayFor. */
  holidays?: readonly PublicHoliday[];
}

export interface DeadlineResult {
  ruleSetVersion: string;
  provisional: boolean;
  provisionalLabel: string | null;
  objection: Banner;
  lateObjection: { offered: boolean; reviewRequired: boolean; description: string; sourceUrl: string | null };
  decision: Banner | null;
  tatApplication: Banner | null;
  tatPayment: { amount: number | null; basis: string; description: string; sourceUrl: string | null; provisional: boolean };
  adr: { description: string; sourceUrl: string | null };
}

export const PROVISIONAL_LABEL = "Provisional: rules pending legal review";

function rule(ruleSet: RuleSet, key: ProcedureRule["ruleKey"]): ProcedureRule {
  const found = ruleSet.rules.find((item) => item.ruleKey === key);
  if (!found) throw new RangeError(`Rule set ${ruleSet.version} has no "${key}" rule.`);
  return found;
}

function assumptionsFor(item: ProcedureRule): string[] {
  const list = [
    item.excludeTriggerDay
      ? "The day the notice was received is not counted; day 1 is the next day."
      : "The day the notice was received counts as day 1.",
    item.weekendHolidayRule === "calendar"
      ? "Calendar days: weekends and public holidays are counted, and a deadline on a weekend is not moved."
      : "A deadline that falls on a weekend or a public holiday moves to the next working day (only holidays a reviewer has checked count).",
  ];
  if (item.countingTodoVerify) list.push("TODO_VERIFY: these counting conventions have not been confirmed by a legal reviewer.");
  return list;
}

function holidayOn(date: IsoDate, holidays: readonly PublicHoliday[], verifiedOnly: boolean): PublicHoliday | undefined {
  return holidays.find((day) => day.date === date && (!verifiedOnly || day.verified));
}

/**
 * The last day to act, counting `periodDays` from the trigger under the rule's
 * conventions. Under "next_business_day" a deadline on a weekend or a VERIFIED
 * public holiday moves to the next working day; unverified holidays never
 * extend a deadline.
 */
export function dueDateFor(item: ProcedureRule, trigger: IsoDate, holidays: readonly PublicHoliday[] = []): IsoDate {
  if (!item.periodDays) throw new RangeError(`Rule ${item.ruleKey} has no period.`);
  let due = addDays(trigger, item.excludeTriggerDay ? item.periodDays : item.periodDays - 1);
  if (item.weekendHolidayRule === "next_business_day") {
    while (isWeekend(due) || holidayOn(due, holidays, true)) due = addDays(due, 1);
  }
  return due;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * When the last day is a weekend or a listed public holiday (verified or not),
 * the working day before it. Moving earlier is always safe, so unverified
 * holidays count here. Returns null on an ordinary working day.
 */
export function closedDayFor(dueDate: IsoDate, holidays: readonly PublicHoliday[] = []): Banner["closedDay"] {
  const holiday = holidayOn(dueDate, holidays, false);
  if (!holiday && !isWeekend(dueDate)) return null;
  const reason = holiday
    ? `${holiday.name}, a public holiday${holiday.verified ? "" : " (date not yet confirmed)"}`
    : `a ${WEEKDAYS[new Date(`${dueDate}T00:00:00Z`).getUTCDay()]}`;
  let lodgeBy = addDays(dueDate, -1);
  while (isWeekend(lodgeBy) || holidayOn(lodgeBy, holidays, false)) lodgeBy = addDays(lodgeBy, -1);
  return { reason, lodgeBy };
}

function countdown(item: ProcedureRule, ruleSet: RuleSet, key: Banner["key"], trigger: IsoDate, today: IsoDate, holidays: readonly PublicHoliday[]): Banner {
  const dueDate = dueDateFor(item, trigger, holidays);
  const closedDay = closedDayFor(dueDate, holidays);
  const closedNote = closedDay
    ? ` That day is ${closedDay.reason}, when offices may be closed, so aim to lodge it by ${formatDate(closedDay.lodgeBy)}.`
    : "";
  const daysLeft = daysBetween(today, dueDate);
  const urgentAt = item.urgentDays ?? 10;
  const state: BannerState = daysLeft < 0 ? "possibly_lapsed" : daysLeft <= urgentAt ? "urgent" : "on_track";
  const dayWord = (n: number) => (Math.abs(n) === 1 ? "day" : "days");
  const titles: Record<Banner["key"], Record<BannerState, string>> = {
    objection: {
      unknown: "Deadline unknown",
      on_track: `${daysLeft} ${dayWord(daysLeft)} left to object`,
      urgent: `Urgent: ${daysLeft} ${dayWord(daysLeft)} left to object`,
      possibly_lapsed: "The time to object has possibly lapsed",
    },
    tat_application: {
      unknown: "Deadline unknown",
      on_track: `${daysLeft} ${dayWord(daysLeft)} left to apply to the Tax Appeals Tribunal`,
      urgent: `Urgent: ${daysLeft} ${dayWord(daysLeft)} left to apply to the Tax Appeals Tribunal`,
      possibly_lapsed: "The time to apply to the Tax Appeals Tribunal has possibly lapsed",
    },
    objection_decision: { unknown: "", on_track: "", urgent: "", possibly_lapsed: "" },
  };
  const messages: Record<BannerState, string> = {
    unknown: "",
    on_track: `The last day is ${formatDate(dueDate)}.${closedNote}`,
    urgent: `The last day is ${formatDate(dueDate)}. Lodge it as soon as you can.${closedNote}`,
    possibly_lapsed: `The last day appears to have been ${formatDate(dueDate)}. You can still ask URA to accept a late objection if you have a good reason; a professional should review this.`,
  };
  return {
    key, state, title: titles[key][state], message: messages[state], dueDate, daysLeft,
    ruleKey: item.ruleKey, ruleLabel: item.label, ruleSetVersion: ruleSet.version, sourceUrl: item.sourceUrl,
    provisional: !ruleSet.approvedForComputation, assumptions: assumptionsFor(item),
    closedDay: state === "possibly_lapsed" ? null : closedDay,
  };
}

export function computeDeadlines(input: DeadlineInput, ruleSet: RuleSet): DeadlineResult {
  const provisional = !ruleSet.approvedForComputation;
  const holidays = input.holidays ?? [];
  const objectionRule = rule(ruleSet, "objection");

  const objection: Banner = input.dateServed
    ? countdown(objectionRule, ruleSet, "objection", input.dateServed, input.today, holidays)
    : {
      key: "objection", state: "unknown", title: "Deadline unknown: tell us when you received this",
      message: "The time to object counts from the day you received the assessment, not the date printed on it.",
      dueDate: null, daysLeft: null, ruleKey: "objection", ruleLabel: objectionRule.label, ruleSetVersion: ruleSet.version,
      sourceUrl: objectionRule.sourceUrl, provisional, assumptions: assumptionsFor(objectionRule), closedDay: null,
    };
  // Once an objection is lodged the objection countdown no longer applies.
  if (input.objectionFiledOn && objection.state !== "unknown") {
    objection.state = "on_track";
    objection.title = `Objection lodged on ${formatDate(input.objectionFiledOn)}`;
    objection.message = "Keep proof of the date you lodged it.";
    objection.closedDay = null;
  }

  const late = rule(ruleSet, "late_objection");
  const lapsed = objection.state === "possibly_lapsed" && !input.objectionFiledOn;

  let decision: Banner | null = null;
  if (input.objectionFiledOn) {
    const decisionRule = rule(ruleSet, "objection_decision");
    const day = dueDateFor(decisionRule, input.objectionFiledOn, holidays);
    const left = daysBetween(input.today, day);
    const passed = left < 0 && !input.decisionServedOn;
    decision = {
      key: "objection_decision", state: input.decisionServedOn ? "on_track" : passed ? "passed" : "waiting",
      title: input.decisionServedOn ? `URA's decision received on ${formatDate(input.decisionServedOn)}`
        : passed ? `Day ${decisionRule.periodDays} has passed without a decision` : `URA's decision is due by ${formatDate(day)}`,
      message: passed ? "URA's time to decide has passed. Tell your reviewer; a professional should advise on the next step."
        : input.decisionServedOn ? "Upload the decision so the Tribunal countdown can start." : `${left} days until URA's time to decide ends.`,
      dueDate: day, daysLeft: left, ruleKey: "objection_decision", ruleLabel: decisionRule.label, ruleSetVersion: ruleSet.version,
      sourceUrl: decisionRule.sourceUrl, provisional, assumptions: assumptionsFor(decisionRule), closedDay: null,
    };
  }

  const tatRule = rule(ruleSet, "tat_application");
  const tatApplication = input.decisionServedOn
    ? countdown(tatRule, ruleSet, "tat_application", input.decisionServedOn, input.today, holidays)
    : null;

  const payRule = rule(ruleSet, "tat_payment");
  const fraction = payRule.paymentFraction;
  let amount: number | null = null;
  if (fraction !== null && input.taxAssessed !== null) {
    const share = Math.round(input.taxAssessed * fraction);
    amount = Math.max(share, Math.max(0, input.taxNotInDispute ?? 0));
  }
  const percent = fraction === null ? "" : `${Math.round(fraction * 100)}%`;
  const adr = rule(ruleSet, "adr");

  return {
    ruleSetVersion: ruleSet.version,
    provisional,
    provisionalLabel: provisional ? PROVISIONAL_LABEL : null,
    objection,
    lateObjection: { offered: lapsed, reviewRequired: lapsed, description: late.description, sourceUrl: late.sourceUrl },
    decision,
    tatApplication,
    tatPayment: {
      amount,
      basis: amount === null ? "Confirm the tax assessed first."
        : `The higher of ${percent} of the tax assessed (${formatUgx(Math.round((input.taxAssessed ?? 0) * (fraction ?? 0)))}) and the tax not in dispute (${formatUgx(Math.max(0, input.taxNotInDispute ?? 0))}). TODO_VERIFY: whether "tax assessed" includes penal tax and interest.`,
      description: payRule.description, sourceUrl: payRule.sourceUrl, provisional,
    },
    adr: { description: adr.description, sourceUrl: adr.sourceUrl },
  };
}

/** Seed rule set; mirrors supabase/migrations/20261110000000_challenge_assessment.sql. */
export const SEED_RULE_SET: RuleSet = Object.freeze({
  version: "objections-2026.v1",
  title: "Objections, Tribunal applications and payment before the Tribunal (published rules)",
  approvedForComputation: false,
  sources: ["https://ura.go.ug/en/domestic-taxes/objection-appeals/", "https://monitor.co.ug/uganda/business/prosper/resolving-tax-disputes-3558190"],
  rules: [
    { ruleKey: "objection", label: "Objection to URA", triggerEvent: "service_of_assessment", periodDays: 45, urgentDays: 10, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: null, description: "Object within 45 days of receiving the assessment.", sourceUrl: "https://ura.go.ug/en/domestic-taxes/objection-appeals/" },
    { ruleKey: "late_objection", label: "Late objection", triggerEvent: "lapse_of_objection_period", periodDays: null, urgentDays: null, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: null, description: "The Commissioner may accept a late objection for absence from Uganda, sickness or another reasonable cause, if there was no unreasonable delay.", sourceUrl: "https://ura.go.ug/en/domestic-taxes/objection-appeals/" },
    { ruleKey: "objection_decision", label: "URA decision on the objection", triggerEvent: "objection_filed", periodDays: 90, urgentDays: null, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: null, description: "URA has 90 days to decide an objection.", sourceUrl: "https://monitor.co.ug/uganda/business/prosper/resolving-tax-disputes-3558190" },
    { ruleKey: "tat_application", label: "Application to the Tax Appeals Tribunal", triggerEvent: "service_of_objection_decision", periodDays: 30, urgentDays: 10, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: null, description: "Apply to the Tax Appeals Tribunal within 30 days after service of the objection decision.", sourceUrl: "https://ura.go.ug/en/domestic-taxes/objection-appeals/" },
    { ruleKey: "tat_payment", label: "Payment before the Tribunal", triggerEvent: "none", periodDays: null, urgentDays: null, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: 0.3, description: "Pay 30% of the tax assessed or the tax not in dispute, whichever is higher, before the Tribunal hears the application.", sourceUrl: "https://ura.go.ug/en/domestic-taxes/objection-appeals/" },
    { ruleKey: "adr", label: "Alternative dispute resolution", triggerEvent: "none", periodDays: null, urgentDays: null, excludeTriggerDay: true, weekendHolidayRule: "calendar", countingTodoVerify: true, paymentFraction: null, description: "URA and the taxpayer may agree to settle outside the Tribunal. This never replaces filing on time.", sourceUrl: "https://ura.go.ug/en/domestic-taxes/objection-appeals/" },
  ],
}) as RuleSet;
