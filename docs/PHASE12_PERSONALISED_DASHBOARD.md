# Phase 12: personalised dashboard

The dashboard is at **Workspace → My dashboard** (`#workspace` or `#ws-dashboard`). Users must be signed in; it uses the existing Supabase sign-in and the Challenge API conventions.

## Parts

| Part | Where |
| --- | --- |
| Profile store | `user_profiles` (migration `20261112000400`). One row per Supabase user. RLS on, Worker-only access, no DELETE. The Worker reads and writes only the signed-in user's row. |
| Personalisation service | `worker/challenge/personalise.mts`: profile validation (`applyProfileUpdate`), `dashboardFor`, `discoverObligations`, `recommendations` and `profileContext`. |
| API | `GET /api/challenge/profile` returns the profile, dashboard, recommendations and options. `POST /api/challenge/profile` takes a partial update (any question may be skipped); `completeOnboarding: true` finishes onboarding. `POST /api/challenge/profile/discover` takes `{facts}` and runs and saves the obligation check. |
| Interface | `dashboard.js`: onboarding, the Simple/Professional switch, recommendations, Tax Companion, modules and "Discover my tax obligations". |
| AI context | The chat and advisor send `profile` (`userCategory`, `businessType`, `experienceMode`). The Worker accepts only enumerated values and tells the model the user's category and the explanation style. It is never treated as evidence. |

## Onboarding

The five questions are: who you are; personal or business; type of business; tax knowledge; and topics wanted. Every question can be skipped, and the answers can be changed later with "Edit my profile". Tax knowledge sets the starting mode: "professional" gives Professional mode, anything else gives Simple. The user can switch modes at any time.

## Dashboards

The modules shown depend on the user category; the layouts are in `LAYOUT` in `personalise.mts`.

| Category | Modules |
| --- | --- |
| Individual and employee | Overview, employment and PAYE, obligations, calculators, dates, documents and FAQs. |
| Self-employed, small business and company | Compliance overview, obligations, VAT, corporation tax (companies only), withholding, PAYE for employees (only if the user employs staff), provisional tax, dates, payments and reports. |
| Accountant | Client portfolio (practice workspace), computation, obligations, legislation, assessments, dates, reports and documents. |
| Consultant | Clients, research, computation, disputes, planning, legislation and reports. |
| Finance manager | Overview, exposure, corporation tax, payments, provisions, dates, reports and legislation. |
| Tax administrator | Review queues, legislation, research and assessments. |

In Simple mode the dashboard adds a "Learn the basics" module and shows the Tax Companion first. Professional mode shows statutory references.

## Discover my tax obligations

The rules are in `RULES` in `personalise.mts`. Each obligation appears only if the user's answers support it, and it carries:

- what it is, in both Simple and Professional wording;
- why it may apply (the answers it rests on);
- the legal provisions, retrieved from the legislative database with their verification status (or a statement that the law is not in the database, as for Local Service Tax);
- what to do, when, and the documents needed;
- a link to the matching TaxComp tool.

Each obligation has one of two statuses:

- **Applies on the facts you gave**: the answers directly trigger it, for example "employs staff" triggers PAYE withholding.
- **May apply: needs more facts or a check**: it depends on something TaxComp has not verified (a threshold, a designation, an eligibility rule).

The results never state a rate, threshold or due date that TaxComp has not verified, and say so. A test checks that the rules contain no percentages, UGX amounts or dates.

## Recommendations

Each recommendation names the data it comes from.

| Recommendation | Comes from |
| --- | --- |
| Profile and discovery prompts | Whether the user has completed their profile and run the obligation check |
| Corporation tax, PAYE, VAT and rental reminders | Obligations that apply on the user's facts |
| The count of obligations to check | The user's last obligation check |
| Open assessment cases | The user's Challenge an Assessment cases |
| Client deadlines (accountants and consultants) | Practice-workspace obligations due within 30 days or overdue, for organisations where the user is an active member other than a client |
| Bill changes and the coverage note (professional categories) | The legislative watch, and the legislative database's coverage note |

## Tests

- `worker/personalise.test.mjs`:
  - category dashboards;
  - no assumptions;
  - beginner layout;
  - validation;
  - per-user privacy;
  - discovery with database citations and statuses;
  - recommendations from practice data;
  - the AI profile context, including that free text is rejected.
- `dashboard.test.js`: Tax Companion routing for the brief's example questions.
- `scripts/challenge-e2e.mjs`: onboarding, the adaptive dashboard, the obligation check, the mode switch, the Companion, editing the profile, and axe accessibility.

## Not yet done

- The deadline engine and the 2026 amendments, which belong to the 2026 legislation update.
- Saved calculation history (the calculators do not store results).
- "Tax registration information": TaxComp does not hold URA registration data; the user's answers are used instead.
