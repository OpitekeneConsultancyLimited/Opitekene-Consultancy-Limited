# TaxComp Impact Intelligence

This builds on what TaxComp already had. Section 1 lists, for each part of the brief, what existed and what was added.

## 1. Audit: what existed and what was built

| Brief section | Already in production (PR #21–#29) | Added now |
| --- | --- | --- |
| 2. Impact intelligence engine | Calculators with working; legislation database and 2026 amendments register; assistant retrieval of `[L#]` and `[A#]` entries | `worker/challenge/impact.mts`. It interprets ordinary language, identifies the tax heads, asks for missing facts, retrieves the law with its legal status, calculates with TaxComp's own calculators, and explains |
| 3. Tax Impact Assessment | None | Tax Tools → **Tax Impact Assessment** (`impact-assessment.js`, `POST /api/impact`) |
| 4. Interactive scenarios | Calculators for PAYE (with the FY 2025/26 / 2026/27 switch), VAT, company tax, rental, withholding and others; multi-tax transaction analysis | A "What if?" slider that re-runs the assessment. Before/after and both-figure comparison in every result |
| 5. Personal dashboard | Profile, mode switch, "Changed in 2026", recommendations, obligation discovery, Companion | **My saved assessments**. The Companion routes "how does … affect" questions to the impact tool |
| 6. Q&A assistant | `/advisor` and `/chat` with legislation retrieval, citation check, Simple/Professional profile context | The impact result goes into the model's evidence, and the model is told to quote TaxComp's figures and not compute its own. Missing facts become follow-up questions. The chat shows a link to the tool |
| 7. Source and citation system | Status labels on every legislation record; amendments with evidence labels | A source panel for each answer: legal status, kind of source (official Bill, official legislation structure, secondary commentary, TaxComp rule), verification, link to the document |
| 8. Compliance Action Centre | Obligation discovery with legal basis, what to do, when (unverified dates not stated), documents and tool | **My progress** (not started / in progress / done) on each obligation, stored per user. Each impact result lists actions with legal basis, due date (only if verified) and documents |
| 9. Knowledge graph | `legislation_relations` (confirmed/inferred), `law_statutes` principal → amendment, amendments → law and section | Sections in the Act view show **Amended in 2026** (or "Bill proposed a 2026 change"), linked to the register |
| 10. UX | Hash-routed views, sign-in gate, design system | The new tool sits in Tax Tools (menu and catalogue). Results use progressive disclosure: conclusion first, working and sources in collapsible panels |

## 2. How an assessment works

The engine follows the brief's six steps.

1. **The user.** An optional "You are" choice (12 categories). Ordinary users are never asked technical questions they don't need.
2. **The issue.** `interpretQuestion` recognises 13 tax heads and three scenarios that can be calculated, and reads amounts written in ordinary ways ("UGX 180 million", "1.5m", "2,000,000"). Bare years and "12 months" are not mistaken for money.
3. **The law.** The scenario's record comes from `legislation_amendments`. The amending Act's status comes from `law_statutes`, and the principal Act section from `legislation_sections`.
4. **Legal status.** `legalStatus()` maps the register to plain statuses:
   - Proposed Bill (not law);
   - Passed by Parliament, assent not confirmed;
   - Returned by the President;
   - Assent reported, awaiting official verification;
   - Recorded as in force, awaiting official verification.

   A change found only in a Bill is shown as "In the published Bill only; enactment not confirmed". Nothing is labelled verified unless a legal approver has verified it in the reviewer workflow.
5. **The impact.** All figures come from `tax-calculator.js` (`comparePayeAcrossFinancialYears`, `calculateVat`, `calculateWithholdingTax`), run in the Worker. A language model never calculates.
6. **The explanation.** Simple and Professional explanations are built from the same evidence by fixed templates.

### Scenarios

| Scenario | Asks for | Shows |
| --- | --- | --- |
| VAT registration threshold | Taxable supplies over 12 months (a revenue figure in the question is suggested, but the user must confirm it, because revenue can include exempt sales) | The position before (UGX 150m), under the Bill figure (250m) and under the reported figure (300m), with the conflict disclosed and not resolved. Where the result depends on which figure is law, it says so |
| PAYE, FY 2025/26 and FY 2026/27 | Monthly taxable pay; resident or not; primary employer or not | Monthly PAYE in each year, the band-by-band working, and the monthly and annual change. Non-residents get FY 2026/27 only, because no earlier non-resident bands are held. A secondary employer is pointed to the calculator |
| Withholding on payments changed in 2026 | Kind of payment (winnings, telecom commission, public entertainer, qualifying debenture interest), gross payment, and the stake for winnings | Tax to withhold, the working, and the earlier position where the register holds it |

Anything else is reported as "not covered" and the user is pointed to the assistant.

## 3. API

| Method and path | Access | Does |
| --- | --- | --- |
| `POST /api/impact` with body `{question?, scenario?, userType?, facts?}` | Public, site origin only, rate-limited, nothing stored | Returns `{status: needs_facts / assessed / not_covered, understanding, questions, outcomes, steps, assumptions, conflicts, explanation{simple, professional}, actions, sources, limits, taxYear}`. Facts are validated against a fixed list of keys, with positive amounts and simple values only |
| `GET /api/challenge/assessments` | Signed in | The user's saved assessments (newest first, up to 50) |
| `POST /api/challenge/assessments` with body `{title, input}` | Signed in | **Re-runs** the assessment on the server and stores that result. A result sent by the browser is ignored. Only completed assessments can be saved |
| `DELETE /api/challenge/assessments/{id}` | Signed in, owner only | Deletes the user's own saved assessment (404 for anyone else's) |
| `POST /api/challenge/profile` with body `{progress: {obligationId: not_started / in_progress / done}}` | Signed in | Compliance progress. Ids must be known obligation rules |

## 4. Database

Migration `20261112000600_saved_assessments.sql`:

- **`saved_assessments`.** Columns: id (UUID), user_id, title, scenario, input_json, result_json, created_at. RLS is on, access is Worker-only, and API roles are revoked. The Worker may SELECT, INSERT and DELETE, but not UPDATE.
- **`user_profiles.obligation_status_json`.** A JSON object, default `{}`.

The migration is additive and idempotent, and changes no existing data. The backup order includes the new table.

## 5. Tests

- **`worker/impact.test.mjs` (7 tests).**
  - Interpretation, including the brief's example question.
  - Missing-fact questions.
  - The VAT before, Bill and reported positions at 180m, 280m and 350m, with the conflict disclosed and no "Verified" label, Act number or Cap. 349.
  - **PAYE at eight salaries in both years, checked against a reference calculation written independently from the published bands.**
  - Withholding amounts.
  - Input validation and the never-call-a-Bill-law status mapping.
  - The public API (origin, method, bad JSON).
  - Saved assessments: recomputed by the server, private, and deletable only by the owner.
  - Compliance progress validation.
  - Assistant integration (follow-up questions, impact in the response).
- **Front-end unit tests.** `mergeFacts`, section-to-amendment links, and Companion routing.
- **`scripts/challenge-e2e.mjs` (121 checks; 11 new).**
  - The full impact flow on a phone-sized screen: example question, missing fact, the three positions, the source panel with the official Bill link, Professional mode, the what-if slider, axe accessibility, and saving.
  - The saved list on the dashboard.
  - Compliance progress saved.
  - The "Amended in 2026" marker on VAT s.7.

**Legal accuracy is not shown by tests.** The independent PAYE reference checks the arithmetic, not the law. Every figure is still pending verification against the enacted Acts.

## 6. Security

- `/api/impact` stores nothing, accepts only the site origin, is rate-limited, and validates every fact.
- Saved assessments and progress need a verified Supabase sign-in. Rows are filtered by user id; RLS and revoked API roles protect them as for other tables.
- The server never trusts a result sent by the browser.
- No AI output writes to the legislation database. Amendment records change only through the reviewer workflow, and only approvers can verify them.
- No keys or secrets are in front-end code.

## 7. Limitations and blockers

- **Legal verification is blocked on the gazetted 2026 Acts** (none found online). The five conflicting figures stay unresolved, and the eight changes found only in a Bill stay unconfirmed.
- **Deadlines.** None are stated, because none are verified.
- **Three scenarios only.** VAT registration, PAYE and the 2026 withholding changes can be calculated. Corporation tax, rental and excise scenarios can be added on the same engine. The existing calculators already cover those taxes.
- **The section 7 VAT test.** TaxComp compares "more than" the annual threshold. The full statutory test, including any shorter-period test, is not held.
- **Court and Tribunal decisions** come only from reviewer-entered case law (Challenge an Assessment). ULII's terms forbid automated use.
- **Chat history** stays on the user's device, as before. "Recent AI consultations" is the on-device history in Ask TaxComp, not a dashboard list.

## 8. User guide

1. Go to **Tax Tools → Tax Impact Assessment**, or ask the Tax Companion on your dashboard "how does … affect me?".
2. Describe your situation in your own words, or tap an example. You can also choose a check and say who you are.
3. Answer the few questions TaxComp asks. A figure from your question is filled in for you to confirm.
4. Read the conclusion. **Professional** shows the provision and evidence.
5. Compare the positions in "Before and after the change". A highlighted row means the Bill and the reported Act differ.
6. Move the **What if?** slider to try other figures.
7. Open **How it was calculated** for the working and assumptions, and **Sources and legal status** for each source, its status, and a link to the Bill.
8. Follow **What to do**. If you are signed in, choose **Save to my dashboard**. Saved assessments appear under **My saved assessments**.
9. On the dashboard, record your progress on each obligation under **Discover my tax obligations**.
