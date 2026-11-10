# User guide: Challenge an Assessment

## For taxpayers

1. **Sign in**, then open **Challenge a URA assessment**. It's on the home page, in the Tax Tools menu and under Workspace → My assessments.
2. **Agree** to how your documents are handled. You only do this once.
3. **Start a new case** and add your notice. Upload a PDF, take a photo with your phone, upload a Word file, or paste the text.
4. **Check every figure.** TaxComp uses a figure only after you confirm it. Correct anything that's wrong. Tick "I can't confirm this" if you're unsure.
5. **Enter the day you received the notice.** Your time to object counts from that day, not from the date printed on the notice.
6. **Your records:** add each figure you think is wrong, with your own figure, and say whether you have the papers to support it. Upload those papers if you have them.
7. **Where you stand:** see what URA is claiming, your deadline, each item's result, the law for your period and related Tribunal decisions. Switch to **Professional** to see the full workings.
8. **Your pack:**
   - Tick off your documents.
   - Download the free summary and checklist.
   - With a paid plan, download the draft objection letter, the schedules and the briefing as a Word file (or print / save as PDF). Edit the draft before you use it.
   - If your case needs a professional review, the full pack unlocks once a reviewer signs it off.
9. **Delete** a case at any time; the case and all its files go.

TaxComp gives a preliminary position to help you prepare. It is not a decision on your case.

## For Opitekene reviewers

- The owner adds you with SQL:

  ```sql
  INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at)
  VALUES ('<auth user id>', '<email>', 0, now()::text);
  ```

  Set `can_approve_law` to 1 only for legal approvers.
- **Review queue** lists the cases assigned to you, with the reasons they need review. Open one to see the professional view. Then:
  - set an item's outcome if you disagree with the computed one;
  - **Sign off this version** or **Request changes**.

  Any later change by the taxpayer reopens the review.
- **Record a paid review or managed dispute** after payment, with its payment reference.
- **Law and cases admin:**
  - Paste the official ULII text for each provision and save it as verified.
  - Legal approvers can then approve a provision for computation (with its formula), and approve the deadline rule set.
  - Add Tax Appeals Tribunal decisions (citation, parties, date, ULII link and issue tags).
- Everything you view, change or download in a case is recorded in the audit log.
