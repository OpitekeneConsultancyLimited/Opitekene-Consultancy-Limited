# Launch-gate register

Audit finding **M2**. Code: `worker/launch-gates.mjs`, `worker/launch-gates-admin.mjs`, `worker/commercial-governance.mjs`. Database: `taxcomp.launch_gates` and `taxcomp.launch_gate_events` (migration `20261114000200`). Page: `https://taxcomp-uganda-chat.omaratomdenis1.workers.dev/admin/gates` (named administrators only).

## The eight gates

| # | Gate | Responsible role | Required evidence (summary) | Status (14 Nov 2026) |
|---|---|---|---|---|
| 1 | Legal approval | Qualified Ugandan tax lawyer | Legal content verified through the register by two people; 5 conflicts resolved; time limits and holidays approved; signed memo | Not started |
| 2 | Tax calculation approval | Qualified tax reviewer | Calculation inventory and test register; expected results from the reviewer; tests passing; rule sets verified; sign-off | Not started |
| 3 | Security approval | Independent security assessor | Penetration test with highs closed; cross-tenant tests; named admins with two-step sign-in, shared token off; scanner deployed and EICAR tested; sign-off | Not started |
| 4 | Privacy approval | Ugandan data-protection adviser | DPPA 2019 assessment; data inventory and processing register; retention and breach plan; processor register; PDPO registration; sign-off | Not started |
| 5 | Operations approval | Operations owner | RTO/RPO set; DR test; backup key in a password manager with two custodians; monitoring live; custom SMTP with SPF/DKIM/DMARC; sign-off | Not started |
| 6 | Billing approval | Finance owner | Flutterwave keys as secrets; sandbox payment test suite; reconciliation tested; sign-off | Not started |
| 7 | Customer support approval | Product owner | Channels and hours; response targets; escalation for legal and tax questions; complaints procedure; sign-off | Not started |
| 8 | Public launch approval | Management | Gates 1–7 approved and in date; management decision | Not started |

The full required-evidence lists are in the migration and are shown on the page. They are fixed by migration and cannot be edited in the app. No responsible person is named yet: names are recorded only when management appoints someone.

## Rules (enforced by the Worker and, where marked, by the database)

1. **Nothing is approved automatically.** No code path sets `approved` except an explicit decision by a named approver.
2. **Evidence first.** A gate can be submitted only with at least one evidence item (an https link or a document reference) and a named responsible person. *(Database: an approved gate must carry evidence.)*
3. **Independent approval.** Only an administrator with `can_approve_gates` can approve, reject or revoke, and never the person who submitted the evidence. *(Database: `approved_by <> evidence_submitted_by`.)*
4. **Review date.** Every approval needs a review date after today and within 12 months. After that date the gate shows **Approval expired** and launch readiness treats it as not approved. *(Database: review date must be after the approval date.)*
5. **Public launch last.** Gate 8 can be approved only when gates 1–7 are approved and in date. *(Database trigger.)*
6. **Allowed moves only:** not started → collecting evidence → evidence submitted → approved or rejected; approved → revoked; rejected or revoked → collecting evidence. *(Database trigger.)* To renew an approval, an approver revokes it, then new evidence is recorded and submitted.
7. **Tamper-evident history.** Every change is appended to `launch_gate_events`. The table is hash-chained, the Worker can only insert, and nobody can update or delete rows. The page checks the chain each time it loads.

## Two keys for launch

`getCommercialLaunchReadiness` returns `launchEligible: true` only when:

* **every** deploy-time flag in `wrangler.toml` is `"true"`, now eight, including the new `PHASE11_TAX_CALCULATION_APPROVED`; **and**
* **every** gate in the register is approved and in date.

If the register cannot be read, launch is blocked. Neither key is ever set by code.

## How to use it

1. Management appoints the responsible people. An administrator with `can_manage_gates` records the names, outstanding issues and evidence on `/admin/gates`.
2. When the evidence is complete, they press **Submit for approval**. The gate is then frozen.
3. A different administrator with `can_approve_gates` reads the evidence. They then either **approve** (with a review date and notes on what they checked) or **reject** (with reasons).
4. Use **Show history** for any gate's full record.
