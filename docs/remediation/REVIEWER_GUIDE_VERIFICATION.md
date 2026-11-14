# Reviewer guide: verifying, disputing and withdrawing legal material

For TaxComp reviewers and legal approvers. Open **Challenge an Assessment** and choose the **Verification register** tab (you see it only if you are a reviewer).

## Your role

- **Reviewer:** researches records, submits them for verification with evidence, marks records disputed, and requests reinstatement.
- **Legal approver:** everything a reviewer can do, plus approving or rejecting requests and emergency withdrawal.
- **Nobody** can approve a request they prepared, or content they wrote or entered (for example a holiday you added or provision text you pasted). The system and the database both refuse it.

Ask the owner to make you a reviewer or approver; the SQL is in `docs/challenge-assessment/user-guide.md`. Each person needs their own account.

## Which sources count

| You may verify against | You may not verify against |
|---|---|
| An Act of Parliament (official text: ULRC, Parliament, Uganda Gazette) | A Bill, even one that has passed third reading |
| A statutory instrument | A budget speech |
| A Uganda Gazette notice, including commencement notices | A press report or newsletter |
| A judgment or Tax Appeals Tribunal decision (for case law) | Commentary, textbooks, AI output |
| A URA publication (shown to users as administrative guidance, not law) | |

Always record the instrument number, the commencement date, and the effective period where they apply. If you cannot find an assent or commencement date, leave it blank. Never guess.

## Submitting a record

1. Find the record (Law and cases admin, or its id).
2. In **Submit a record for verification**, enter the evidence and say exactly what you compared, against which source.
3. Click **Submit for independent approval**. Nothing changes for users yet.

## Approving or rejecting (legal approvers)

Open the request, check the source yourself, then **Approve**, or **Reject** with the reason. Approval takes effect immediately for every user.

## When something is wrong

- **Disputed:** if sources conflict, use **Mark disputed**. Users then see "Disputed legal position", and a verified record stops being shown as verified.
- **Emergency withdrawal (approvers):** if material is wrong and could mislead, use **Emergency withdrawal**. It disappears from every page, the assistant, deadlines and calculators at once. Users see your reason, so write it plainly.
- **Reinstating:** use **Request reinstatement** on the withdrawn item, with evidence. A different approver must approve it, and the record then needs a fresh verification.

## Audit trail

The register shows whether the audit trail's hash chain is intact. If it ever says **BROKEN**, stop and tell the owner: it means a record of an approval was altered outside the system.
