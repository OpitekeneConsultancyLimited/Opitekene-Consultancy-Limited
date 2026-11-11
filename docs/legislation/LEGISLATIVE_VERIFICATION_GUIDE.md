# Verifying legislation

Every captured Act, section and schedule starts as **Unverified**. The captured source is a private compendium, and the official edition is the Uganda Law Reform Commission's (ULRC) Principal Laws of Uganda, 2024. The FY 2024/25 edition is a historical source, not proof of the law in force in 2026.

## Who can do what

| Role | Can |
| --- | --- |
| Signed-in user | Read only. |
| Reviewer (in `challenge_reviewers`) | Mark records *Under review*, *Requires amendment review* or *Unverified*, add notes, view history and compare editions. |
| Legal approver (`can_approve_law = 1`) | Everything a reviewer can, plus mark records *Verified against official edition* or *Superseded*, confirm or correct chapter and commencement date, correct a heading, and enter official wording. |

Ordinary users cannot change anything. The public API is read-only, and the Worker refuses verification by anyone who is not an approver.

## Where

Sign in, open **Challenge an Assessment → Law and cases admin → Legislation verification**.

## Checking an Act

1. Open "Acts and regulations" and find the Act.
2. Against the ULRC 2024 edition, check:
   - the title;
   - the chapter (for example Cap. 338);
   - the commencement date;
   - the Parts;
   - each section number and heading;
   - the schedules.
3. Choose a status:
   - **Under review**: while you work.
   - **Verified against official edition** (approvers only): give the official source link (https) and a note of what you checked, for example "Chapter, Parts and all 156 headings checked against ULRC Principal Laws 2024, Vol. X". If the chapter or commencement date was wrong, enter the correct value.
   - **Requires amendment review**: the edition is known to be changed by a later Act (for example the Income Tax (Amendment) Act, 2026) that has not been captured.
   - **Superseded** (approvers only): a later edition replaces this record.
4. Choose **Save status**. The change, your user id, the time and the note are written to the history. Use **History** to see every change.

## Checking sections

- "Sections" opens with flagged records first. Income Tax Act s.118I and Tax Procedures Code Act s.40E keep the captured numbers but are flagged `numbering-check`: they appear to carry pre-revision numbers. Confirm the official numbering. If it differs, record that in the note and mark the section **Requires amendment review**. Do not renumber it by hand: capture a corrected edition instead (see `LEGISLATIVE_IMPORT_GUIDE.md`).
- Approvers may correct a heading. The old and new headings are kept in the history.
- **Wording**: approvers may paste official wording, together with the link to the official text it was copied from. Mark it verified only after checking it. TaxComp never generates wording.

## Relations

Relations marked **inferred** were suggested from section headings (for example, Income Tax Act s.80 and s.88). Relations marked **confirmed** come from the legislation itself (an instrument's enabling provision). The AI and the Knowledge Centre show which kind each one is.

## What verification changes

- The Knowledge Centre badge changes from "Unverified" to "Verified against official edition".
- The AI's evidence label changes from "Unverified structure only" to "Verified structure only", or "Verified legislation with full wording" when verified wording is held.
- A verified record is never overwritten by a later import.

## Outstanding checks

All 18 laws and 701 sections are unverified. In addition, items B4 and B10 to B15 in `docs/challenge-assessment/todo-verify.md` cover:

- the chapter numbers;
- the Tax Appeals Tribunals Act's Cap. 341;
- the five added Acts;
- the section structure.
